/**
 * lib/store.js — ตรรกะหลักของระบบการเรียนรู้
 * อ่านหลายชีตพร้อมกันด้วย readMany เพื่อลดจำนวนคำขอไปยัง Google Sheets
 */

import {
  SHEETS, CATEGORIES, POINTS, APP,
  categoryById, levelOf,
} from './config.js';
import { readAll, readMany, where, findOne, appendRow, appendRows, updateRow } from './sheets.js';
import { uuid, now, today, dateString, diffDays, isTrue } from './util.js';

const DASH_SHEETS = [
  SHEETS.USERS, SHEETS.CHECKINS, SHEETS.QUIZ_RESULTS, SHEETS.LESSON_PROGRESS,
  SHEETS.BADGES, SHEETS.USER_BADGES, SHEETS.MISSIONS, SHEETS.USER_MISSIONS,
];

/* ============================ ผู้ใช้ ============================ */

/** สร้างผู้ใช้ใหม่หรืออัปเดตชื่อ/รูปของผู้ใช้เดิม คืน user_id */
export async function upsertUser(profile) {
  const users = await readAll(SHEETS.USERS);
  const existing = findOne(users, 'line_user_id', profile.lineUserId);

  const patch = {
    display_name: profile.displayName,
    picture_url: profile.pictureUrl,
    status_message: profile.statusMessage,
    last_login: now(),
  };

  if (existing) {
    await updateRow(SHEETS.USERS, existing.__row, existing, patch);
    return existing.user_id;
  }

  const user = {
    user_id: uuid('U'),
    line_user_id: profile.lineUserId,
    total_points: 0,
    level: 1,
    streak_days: 0,
    last_checkin_date: '',
    session_token: '',
    session_expired_at: '',
    created_at: now(),
    ...patch,
  };
  await appendRow(SHEETS.USERS, user);
  return user.user_id;
}

/* ============================ แดชบอร์ด ============================ */

/** รวบรวมข้อมูลของผู้เรียนจากชุดชีตที่อ่านมาแล้ว */
function statsFrom(db, userId) {
  const user = findOne(db[SHEETS.USERS], 'user_id', userId);
  if (!user) throw new Error('ไม่พบผู้ใช้');

  const checkins = where(db[SHEETS.CHECKINS], 'user_id', userId);
  const quizzes = where(db[SHEETS.QUIZ_RESULTS], 'user_id', userId);
  const lessons = where(db[SHEETS.LESSON_PROGRESS], 'user_id', userId)
    .filter((r) => String(r.status) === 'completed');

  const passedCats = new Set();
  let passedCount = 0;
  let perfect = 0;
  for (const q of quizzes) {
    if (isTrue(q.passed)) { passedCats.add(String(q.category_id)); passedCount++; }
    if (Number(q.percent) >= 100) perfect++;
  }

  return {
    user,
    points: Number(user.total_points) || 0,
    streak: Number(user.streak_days) || 0,
    lastCheckin: user.last_checkin_date ? String(user.last_checkin_date).slice(0, 10) : '',
    checkinTotal: checkins.length,
    checkins,
    quizzes,
    quizTotal: quizzes.length,
    quizPassed: passedCount,
    quizPassedDistinct: passedCats.size,
    perfect,
    lessonDone: lessons.length,
    lessonProgress: where(db[SHEETS.LESSON_PROGRESS], 'user_id', userId),
  };
}

function progressValue(stats, type) {
  switch (String(type)) {
    case 'checkin_total': return stats.checkinTotal;
    case 'streak': return stats.streak;
    case 'quiz_total': return stats.quizTotal;
    case 'quiz_passed': return stats.quizPassed;
    case 'quiz_passed_distinct': return stats.quizPassedDistinct;
    case 'perfect': return stats.perfect;
    case 'points': return stats.points;
    case 'lesson_done': return stats.lessonDone;
    default: return 0;
  }
}

function badgeList(db, userId, stats) {
  const owned = new Map(
    where(db[SHEETS.USER_BADGES], 'user_id', userId).map((b) => [String(b.badge_id), String(b.earned_at)])
  );
  return db[SHEETS.BADGES]
    .filter((b) => b.is_active !== false)
    .map((b) => {
      const need = Number(b.condition_value);
      const have = progressValue(stats, b.condition_type);
      return {
        badge_id: b.badge_id,
        name: b.badge_name,
        description: b.description,
        icon: b.icon,
        color: b.color,
        points: Number(b.points),
        earned: owned.has(String(b.badge_id)),
        earned_at: owned.get(String(b.badge_id)) || '',
        progress: need ? Math.min(100, Math.round((have / need) * 100)) : 0,
        have: Math.min(have, need),
        need,
      };
    });
}

function missionList(db, userId, stats) {
  const owned = new Map(
    where(db[SHEETS.USER_MISSIONS], 'user_id', userId).map((m) => [String(m.mission_id), String(m.completed_at)])
  );
  return db[SHEETS.MISSIONS]
    .filter((m) => m.is_active !== false)
    .map((m) => {
      const need = Number(m.condition_value);
      const have = progressValue(stats, m.condition_type);
      return {
        mission_id: m.mission_id,
        name: m.mission_name,
        description: m.description,
        icon: m.icon,
        points: Number(m.points),
        earned: owned.has(String(m.mission_id)),
        completed_at: owned.get(String(m.mission_id)) || '',
        progress: need ? Math.min(100, Math.round((have / need) * 100)) : 0,
        have: Math.min(have, need),
        need,
      };
    });
}

function categoryStats(stats) {
  return CATEGORIES.map((c) => {
    const mine = stats.quizzes.filter((q) => String(q.category_id) === c.id);
    let best = 0;
    let passed = false;
    for (const q of mine) {
      best = Math.max(best, Number(q.percent) || 0);
      if (isTrue(q.passed)) passed = true;
    }
    const lp = stats.lessonProgress.find((r) => String(r.lesson_id) === c.id);
    return {
      id: c.id, name: c.name, icon: c.icon, color: c.color, hours: c.hours,
      attempts: mine.length,
      bestPercent: best,
      passed,
      lessonDone: !!(lp && String(lp.status) === 'completed'),
    };
  });
}

function checkinHistory(stats, days = 14) {
  const map = new Map(stats.checkins.map((r) => [String(r.checkin_date).slice(0, 10), Number(r.points) || 0]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dateString(d);
    out.push({ date: key, label: key.slice(5), points: map.get(key) || 0, done: map.has(key) });
  }
  return out;
}

function rankOf(db, userId) {
  const sorted = db[SHEETS.USERS]
    .map((u) => ({ id: u.user_id, p: Number(u.total_points) || 0 }))
    .sort((a, b) => b.p - a.p);
  const idx = sorted.findIndex((u) => u.id === userId);
  return { rank: idx < 0 ? 0 : idx + 1, total: sorted.length };
}

function dashboardFrom(db, userId) {
  const stats = statsFrom(db, userId);
  const badges = badgeList(db, userId, stats);
  const missions = missionList(db, userId, stats);
  const rank = rankOf(db, userId);
  const u = stats.user;

  return {
    user: {
      user_id: u.user_id,
      display_name: u.display_name,
      picture_url: u.picture_url,
      status_message: u.status_message,
    },
    points: stats.points,
    level: levelOf(stats.points),
    streak: stats.streak,
    checkedInToday: stats.lastCheckin === today(),
    lastCheckin: stats.lastCheckin,
    counters: {
      lessonsDone: stats.lessonDone,
      lessonsTotal: CATEGORIES.length,
      missionsDone: missions.filter((m) => m.earned).length,
      missionsTotal: missions.length,
      badgesDone: badges.filter((b) => b.earned).length,
      badgesTotal: badges.length,
      quizTotal: stats.quizTotal,
      quizPassed: stats.quizPassed,
    },
    rank: rank.rank,
    totalLearners: rank.total,
    badges,
    missions,
    categories: categoryStats(stats),
    checkinHistory: checkinHistory(stats),
  };
}

export async function getDashboard(userId) {
  const db = await readMany(DASH_SHEETS);
  return dashboardFrom(db, userId);
}

/* ============================ คะแนน / รางวัล ============================ */

async function addPoints(users, userId, source, detail, points) {
  const p = Number(points) || 0;
  const user = findOne(users, 'user_id', userId);
  const balance = (Number(user.total_points) || 0) + p;

  await updateRow(SHEETS.USERS, user.__row, user, {
    total_points: balance,
    level: levelOf(balance).level,
  });
  user.total_points = balance;                     // ให้ข้อมูลในหน่วยความจำตรงกับชีต
  user.level = levelOf(balance).level;

  await appendRow(SHEETS.POINTS_LOG, {
    log_id: uuid('PL'),
    user_id: userId,
    source,
    detail,
    points: p,
    balance_after: balance,
    created_at: now(),
  });
  return balance;
}

/**
 * ตรวจเงื่อนไขเหรียญและภารกิจทั้งหมด มอบรางวัลที่เพิ่งสำเร็จ
 * รับ db ที่อ่านมาแล้วเพื่อไม่ต้องอ่านชีตซ้ำ
 */
async function grantRewards(db, userId) {
  const stats = statsFrom(db, userId);
  const newBadges = [];
  const newMissions = [];

  const ownedBadges = new Set(where(db[SHEETS.USER_BADGES], 'user_id', userId).map((b) => String(b.badge_id)));
  for (const b of db[SHEETS.BADGES]) {
    if (b.is_active === false || ownedBadges.has(String(b.badge_id))) continue;
    if (progressValue(stats, b.condition_type) < Number(b.condition_value)) continue;

    const row = { user_badge_id: uuid('UB'), user_id: userId, badge_id: b.badge_id, earned_at: now() };
    await appendRow(SHEETS.USER_BADGES, row);
    db[SHEETS.USER_BADGES].push(row);

    if (Number(b.points) > 0) {
      stats.points = await addPoints(db[SHEETS.USERS], userId, 'badge', 'ได้รับเหรียญ ' + b.badge_name, Number(b.points));
    }
    newBadges.push({
      badge_id: b.badge_id, name: b.badge_name, description: b.description,
      icon: b.icon, color: b.color, points: Number(b.points),
    });
  }

  const ownedMissions = new Set(where(db[SHEETS.USER_MISSIONS], 'user_id', userId).map((m) => String(m.mission_id)));
  for (const m of db[SHEETS.MISSIONS]) {
    if (m.is_active === false || ownedMissions.has(String(m.mission_id))) continue;
    if (progressValue(stats, m.condition_type) < Number(m.condition_value)) continue;

    const row = { user_mission_id: uuid('UM'), user_id: userId, mission_id: m.mission_id, completed_at: now() };
    await appendRow(SHEETS.USER_MISSIONS, row);
    db[SHEETS.USER_MISSIONS].push(row);

    if (Number(m.points) > 0) {
      stats.points = await addPoints(db[SHEETS.USERS], userId, 'mission', 'ทำภารกิจสำเร็จ ' + m.mission_name, Number(m.points));
    }
    newMissions.push({
      mission_id: m.mission_id, name: m.mission_name, description: m.description,
      icon: m.icon, points: Number(m.points),
    });
  }

  return { newBadges, newMissions };
}

/* ============================ เช็คอิน ============================ */

export async function checkin(userId) {
  const db = await readMany(DASH_SHEETS);
  const user = findOne(db[SHEETS.USERS], 'user_id', userId);
  if (!user) throw new Error('ไม่พบผู้ใช้');

  const t = today();
  const last = user.last_checkin_date ? String(user.last_checkin_date).slice(0, 10) : '';
  const alreadyToday = last === t
    || where(db[SHEETS.CHECKINS], 'user_id', userId).some((r) => String(r.checkin_date).slice(0, 10) === t);
  if (alreadyToday) {
    const err = new Error('วันนี้เช็คอินไปแล้ว พรุ่งนี้มาต่อสตรีคกันใหม่');
    err.status = 409;
    throw err;
  }

  const gap = last ? diffDays(last, t) : null;
  const streak = gap === 1 ? (Number(user.streak_days) || 0) + 1 : 1;
  const bonus = Math.min(POINTS.CHECKIN_STREAK_BONUS * (streak - 1), POINTS.CHECKIN_STREAK_MAX);
  const points = POINTS.CHECKIN_BASE + bonus;

  const row = {
    checkin_id: uuid('CI'),
    user_id: userId,
    checkin_date: t,
    streak_days: streak,
    points,
    created_at: now(),
  };
  await appendRow(SHEETS.CHECKINS, row);
  db[SHEETS.CHECKINS].push(row);

  await updateRow(SHEETS.USERS, user.__row, user, { streak_days: streak, last_checkin_date: t });
  user.streak_days = streak;
  user.last_checkin_date = t;

  const balance = await addPoints(db[SHEETS.USERS], userId, 'checkin',
    `เช็คอินวันที่ ${t} (สตรีค ${streak} วัน)`, points);
  const rewards = await grantRewards(db, userId);

  return {
    points, bonus, streak, balance,
    ...rewards,
    dashboard: dashboardFrom(db, userId),
  };
}

/* ============================ บทเรียน ============================ */

export async function getLessons(userId) {
  const db = await readMany([SHEETS.LESSONS, SHEETS.LESSON_PROGRESS]);
  const done = new Set(
    where(db[SHEETS.LESSON_PROGRESS], 'user_id', userId)
      .filter((r) => String(r.status) === 'completed')
      .map((r) => String(r.lesson_id))
  );

  return db[SHEETS.LESSONS]
    .filter((l) => l.is_active !== false)
    .sort((a, b) => Number(a.order_no) - Number(b.order_no))
    .map((l) => {
      const c = categoryById(String(l.category_id)) || {};
      return {
        lesson_id: l.lesson_id,
        category_id: l.category_id,
        title: l.title,
        hours: l.hours,
        summary: l.summary,
        objectives: String(l.objectives || '').split('\n').filter(Boolean),
        content_html: l.content_html,
        icon: c.icon || 'fa-book',
        color: c.color || '#4361ee',
        done: done.has(String(l.lesson_id)),
      };
    });
}

export async function completeLesson(userId, lessonId) {
  const db = await readMany(DASH_SHEETS);
  const already = where(db[SHEETS.LESSON_PROGRESS], 'user_id', userId)
    .some((r) => String(r.lesson_id) === String(lessonId) && String(r.status) === 'completed');

  if (already) {
    return { points: 0, already: true, newBadges: [], newMissions: [], dashboard: dashboardFrom(db, userId) };
  }

  const row = {
    progress_id: uuid('LP'),
    user_id: userId,
    lesson_id: lessonId,
    status: 'completed',
    points_awarded: POINTS.LESSON_COMPLETE,
    completed_at: now(),
  };
  await appendRow(SHEETS.LESSON_PROGRESS, row);
  db[SHEETS.LESSON_PROGRESS].push(row);

  await addPoints(db[SHEETS.USERS], userId, 'lesson', 'เรียนจบบทเรียน ' + lessonId, POINTS.LESSON_COMPLETE);
  const rewards = await grantRewards(db, userId);

  return {
    points: POINTS.LESSON_COMPLETE,
    already: false,
    ...rewards,
    dashboard: dashboardFrom(db, userId),
  };
}

/* ============================ Quiz ============================ */

/** ส่งเฉพาะโจทย์และตัวเลือก ไม่ส่งเฉลยไปยังเบราว์เซอร์ */
export async function getQuiz(categoryId) {
  const cat = categoryById(String(categoryId));
  if (!cat) throw new Error('ไม่พบหมวดหมู่ที่เลือก');

  const rows = await readAll(SHEETS.QUESTIONS);
  const questions = where(rows, 'category_id', categoryId)
    .filter((q) => q.is_active !== false)
    .sort((a, b) => Number(a.order_no) - Number(b.order_no))
    .map((q) => ({
      question_id: q.question_id,
      question_text: q.question_text,
      choices: [q.choice_a, q.choice_b, q.choice_c, q.choice_d],
    }));

  if (!questions.length) throw new Error('ยังไม่มีข้อสอบในหมวดนี้');
  return { category: cat, questions };
}

export async function submitQuiz(userId, categoryId, answers, durationSeconds) {
  const cat = categoryById(String(categoryId));
  if (!cat) throw new Error('ไม่พบหมวดหมู่ที่เลือก');

  const questionRows = await readAll(SHEETS.QUESTIONS);
  const bank = new Map(
    where(questionRows, 'category_id', categoryId)
      .filter((q) => q.is_active !== false)
      .map((q) => [String(q.question_id), q])
  );
  if (!bank.size) throw new Error('ยังไม่มีข้อสอบในหมวดนี้');

  const resultId = uuid('QR');
  const review = [];
  const answerRows = [];
  let score = 0;

  for (const a of answers || []) {
    const q = bank.get(String(a.question_id));
    if (!q) continue;
    const correct = String(q.correct_answer).toUpperCase();
    const selected = String(a.selected || '').toUpperCase();
    const isCorrect = selected === correct;
    if (isCorrect) score++;

    answerRows.push({
      answer_id: uuid('QA'),
      result_id: resultId,
      user_id: userId,
      question_id: q.question_id,
      selected_answer: selected,
      correct_answer: correct,
      is_correct: isCorrect,
      created_at: now(),
    });
    review.push({
      question_id: q.question_id,
      question_text: q.question_text,
      choices: [q.choice_a, q.choice_b, q.choice_c, q.choice_d],
      selected,
      correct,
      is_correct: isCorrect,
      explanation: q.explanation,
    });
  }

  const total = bank.size;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const passed = percent >= APP.passPercent;

  let points = score * POINTS.QUIZ_PER_CORRECT;
  if (passed) points += POINTS.QUIZ_PASS_BONUS;
  if (percent >= 100) points += POINTS.QUIZ_PERFECT_BONUS;

  const resultRow = {
    result_id: resultId,
    user_id: userId,
    category_id: categoryId,
    score,
    total,
    percent,
    passed,
    points,
    duration_seconds: Number(durationSeconds) || 0,
    created_at: now(),
  };
  await appendRow(SHEETS.QUIZ_RESULTS, resultRow);
  await appendRows(SHEETS.QUIZ_ANSWERS, answerRows);

  const db = await readMany(DASH_SHEETS);
  await addPoints(db[SHEETS.USERS], userId, 'quiz',
    `ทำ Quiz หมวด ${cat.name} ได้ ${score}/${total}`, points);
  const rewards = await grantRewards(db, userId);

  return {
    score, total, percent, passed, points, review,
    ...rewards,
    dashboard: dashboardFrom(db, userId),
    message: passed ? 'ยินดีด้วย ผ่านเกณฑ์แล้ว' : 'ยังไม่ผ่านเกณฑ์ ลองทบทวนแล้วทำใหม่ได้',
  };
}

export async function quizHistory(userId) {
  const rows = await readAll(SHEETS.QUIZ_RESULTS);
  return where(rows, 'user_id', userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 30)
    .map((r) => {
      const c = categoryById(String(r.category_id)) || {};
      return {
        category_id: r.category_id,
        category_name: c.name || r.category_id,
        icon: c.icon || 'fa-clipboard',
        color: c.color || '#4361ee',
        score: Number(r.score),
        total: Number(r.total),
        percent: Number(r.percent),
        passed: isTrue(r.passed),
        points: Number(r.points),
        created_at: String(r.created_at),
      };
    });
}

/* ============================ อันดับ ============================ */

export async function leaderboard(userId) {
  const db = await readMany([SHEETS.USERS, SHEETS.QUIZ_RESULTS, SHEETS.USER_BADGES]);

  const quizCount = new Map();
  for (const q of db[SHEETS.QUIZ_RESULTS]) {
    quizCount.set(String(q.user_id), (quizCount.get(String(q.user_id)) || 0) + 1);
  }
  const badgeCount = new Map();
  for (const b of db[SHEETS.USER_BADGES]) {
    badgeCount.set(String(b.user_id), (badgeCount.get(String(b.user_id)) || 0) + 1);
  }

  const rows = db[SHEETS.USERS]
    .map((u) => {
      const p = Number(u.total_points) || 0;
      const lv = levelOf(p);
      return {
        user_id: u.user_id,
        display_name: u.display_name,
        picture_url: u.picture_url,
        points: p,
        level: lv.level,
        level_name: lv.name,
        streak: Number(u.streak_days) || 0,
        quizzes: quizCount.get(String(u.user_id)) || 0,
        badges: badgeCount.get(String(u.user_id)) || 0,
        isMe: String(u.user_id) === String(userId),
      };
    })
    .sort((a, b) => b.points - a.points || b.badges - a.badges);

  rows.forEach((r, i) => { r.rank = i + 1; });
  return { top: rows.slice(0, 30), me: rows.find((r) => r.isMe) || null, total: rows.length };
}
