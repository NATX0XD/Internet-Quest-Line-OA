/**
 * Api.gs — ฟังก์ชันที่หน้าเว็บเรียกผ่าน google.script.run
 * ทุกฟังก์ชันคืนค่ารูปแบบเดียวกัน { success, message, data }
 */

function safe_(fn) {
  try {
    return fn();
  } catch (err) {
    return fail(err && err.message ? err.message : String(err));
  }
}

/* ============================ ภาพรวม ============================ */

function apiBootstrap(token) {
  return safe_(function () {
    const user = requireUser(token);
    return ok(buildDashboard_(user), 'โหลดข้อมูลสำเร็จ');
  });
}

function buildDashboard_(user) {
  const stats = userStats_(user);
  const lv = levelOf(stats.points);
  const badges = allBadges_(user.user_id);
  const missions = allMissions_(user.user_id);
  const rank = rankOf_(user.user_id);

  return {
    user: {
      user_id: user.user_id,
      display_name: user.display_name,
      picture_url: user.picture_url,
      status_message: user.status_message,
    },
    points: stats.points,
    level: lv,
    streak: stats.streak,
    checkedInToday: stats.lastCheckin === today(),
    lastCheckin: stats.lastCheckin,
    counters: {
      lessonsDone: stats.lessonDone,
      lessonsTotal: CATEGORIES.length,
      missionsDone: missions.filter(function (m) { return m.earned; }).length,
      missionsTotal: missions.length,
      badgesDone: badges.filter(function (b) { return b.earned; }).length,
      badgesTotal: badges.length,
      quizTotal: stats.quizTotal,
      quizPassed: stats.quizPassed,
    },
    rank: rank.rank,
    totalLearners: rank.total,
    badges: badges,
    missions: missions,
    categories: categoryStats_(user.user_id),
    checkinHistory: checkinHistory_(user.user_id, 14),
  };
}

/** สถิติดิบทั้งหมดของผู้เรียนคนหนึ่ง อ่านชีตชุดเดียวแล้วใช้ซ้ำ */
function userStats_(user) {
  const uid = user.user_id;
  const checkins = findAll(SHEETS.CHECKINS, 'user_id', uid);
  const quizzes = findAll(SHEETS.QUIZ_RESULTS, 'user_id', uid);
  const lessons = findAll(SHEETS.LESSON_PROGRESS, 'user_id', uid)
    .filter(function (r) { return String(r.status) === 'completed'; });

  const passedCats = {};
  let perfect = 0;
  let passedCount = 0;
  quizzes.forEach(function (q) {
    if (q.passed === true || String(q.passed).toUpperCase() === 'TRUE') {
      passedCats[q.category_id] = true;
      passedCount++;
    }
    if (Number(q.percent) >= 100) perfect++;
  });

  return {
    points: Number(user.total_points) || 0,
    streak: Number(user.streak_days) || 0,
    lastCheckin: user.last_checkin_date ? String(user.last_checkin_date).substring(0, 10) : '',
    checkinTotal: checkins.length,
    quizTotal: quizzes.length,
    quizPassed: passedCount,
    quizPassedDistinct: Object.keys(passedCats).length,
    perfect: perfect,
    lessonDone: lessons.length,
    quizzes: quizzes,
  };
}

/** สรุปผลรายหมวด: ทำไปกี่ครั้ง คะแนนดีที่สุดเท่าไร ผ่านหรือยัง */
function categoryStats_(uid) {
  const quizzes = findAll(SHEETS.QUIZ_RESULTS, 'user_id', uid);
  const progress = findAll(SHEETS.LESSON_PROGRESS, 'user_id', uid);
  return CATEGORIES.map(function (c) {
    const mine = quizzes.filter(function (q) { return String(q.category_id) === c.id; });
    let best = 0, passed = false;
    mine.forEach(function (q) {
      best = Math.max(best, Number(q.percent) || 0);
      if (q.passed === true || String(q.passed).toUpperCase() === 'TRUE') passed = true;
    });
    const lp = progress.filter(function (r) { return String(r.lesson_id) === c.id; })[0];
    return {
      id: c.id, name: c.name, icon: c.icon, color: c.color, hours: c.hours,
      attempts: mine.length, bestPercent: best, passed: passed,
      lessonDone: !!(lp && String(lp.status) === 'completed'),
    };
  });
}

function checkinHistory_(uid, days) {
  const rows = findAll(SHEETS.CHECKINS, 'user_id', uid);
  const map = {};
  rows.forEach(function (r) { map[String(r.checkin_date).substring(0, 10)] = Number(r.points) || 0; });
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateString(d);
    out.push({ date: key, label: key.substring(5), points: map[key] || 0, done: !!map[key] });
  }
  return out;
}

function rankOf_(uid) {
  const users = readAll(SHEETS.USERS)
    .map(function (u) { return { id: u.user_id, p: Number(u.total_points) || 0 }; })
    .sort(function (a, b) { return b.p - a.p; });
  let rank = 0;
  for (let i = 0; i < users.length; i++) if (users[i].id === uid) { rank = i + 1; break; }
  return { rank: rank, total: users.length };
}

/* ============================ เช็คอิน ============================ */

function apiCheckin(token) {
  return safe_(function () {
    const user = requireUser(token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const fresh = findOne(SHEETS.USERS, 'user_id', user.user_id);
      const last = fresh.last_checkin_date ? String(fresh.last_checkin_date).substring(0, 10) : '';
      const t = today();
      if (last === t) return fail('วันนี้เช็คอินไปแล้ว พรุ่งนี้มาต่อสตรีคกันใหม่');

      const gap = last ? diffDays(last, t) : null;
      const streak = (gap === 1) ? (Number(fresh.streak_days) || 0) + 1 : 1;
      const bonus = Math.min(POINTS.CHECKIN_STREAK_BONUS * (streak - 1), POINTS.CHECKIN_STREAK_MAX);
      const points = POINTS.CHECKIN_BASE + bonus;

      appendRow(SHEETS.CHECKINS, {
        checkin_id: uuid('CI'),
        user_id: fresh.user_id,
        checkin_date: t,
        streak_days: streak,
        points: points,
        created_at: now(),
      });
      updateRowById(SHEETS.USERS, 'user_id', fresh.user_id, {
        streak_days: streak,
        last_checkin_date: t,
      });
      const after = addPoints_(fresh.user_id, 'checkin', 'เช็คอินวันที่ ' + t + ' (สตรีค ' + streak + ' วัน)', points);
      const reward = evaluateRewards_(fresh.user_id);

      const updated = findOne(SHEETS.USERS, 'user_id', fresh.user_id);
      return ok({
        points: points,
        bonus: bonus,
        streak: streak,
        balance: after,
        newBadges: reward.badges,
        newMissions: reward.missions,
        dashboard: buildDashboard_(updated),
      }, 'เช็คอินสำเร็จ');
    } finally {
      lock.releaseLock();
    }
  });
}

/* ============================ บทเรียน ============================ */

function apiGetLessons(token) {
  return safe_(function () {
    const user = requireUser(token);
    const done = {};
    findAll(SHEETS.LESSON_PROGRESS, 'user_id', user.user_id).forEach(function (r) {
      if (String(r.status) === 'completed') done[String(r.lesson_id)] = true;
    });
    const lessons = readAll(SHEETS.LESSONS)
      .filter(function (l) { return l.is_active !== false; })
      .sort(function (a, b) { return Number(a.order_no) - Number(b.order_no); })
      .map(function (l) {
        const c = categoryById(String(l.category_id)) || {};
        return {
          lesson_id: l.lesson_id,
          category_id: l.category_id,
          title: l.title,
          hours: l.hours,
          summary: l.summary,
          objectives: String(l.objectives || '').split('\n').filter(String),
          content_html: l.content_html,
          icon: c.icon || 'fa-book',
          color: c.color || '#4361ee',
          done: !!done[String(l.lesson_id)],
        };
      });
    return ok({ lessons: lessons }, 'โหลดบทเรียนสำเร็จ');
  });
}

function apiCompleteLesson(token, lessonId) {
  return safe_(function () {
    const user = requireUser(token);
    const exist = findAll(SHEETS.LESSON_PROGRESS, 'user_id', user.user_id)
      .filter(function (r) { return String(r.lesson_id) === String(lessonId); })[0];
    if (exist && String(exist.status) === 'completed') {
      return ok({ points: 0, already: true, dashboard: buildDashboard_(findOne(SHEETS.USERS, 'user_id', user.user_id)) },
        'บทเรียนนี้เรียนจบแล้ว');
    }
    appendRow(SHEETS.LESSON_PROGRESS, {
      progress_id: uuid('LP'),
      user_id: user.user_id,
      lesson_id: lessonId,
      status: 'completed',
      points_awarded: POINTS.LESSON_COMPLETE,
      completed_at: now(),
    });
    addPoints_(user.user_id, 'lesson', 'เรียนจบบทเรียน ' + lessonId, POINTS.LESSON_COMPLETE);
    const reward = evaluateRewards_(user.user_id);
    return ok({
      points: POINTS.LESSON_COMPLETE,
      newBadges: reward.badges,
      newMissions: reward.missions,
      dashboard: buildDashboard_(findOne(SHEETS.USERS, 'user_id', user.user_id)),
    }, 'เรียนจบบทเรียนแล้ว +' + POINTS.LESSON_COMPLETE + ' แต้ม');
  });
}

/* ============================ Quiz ============================ */

/** ส่งเฉพาะโจทย์และตัวเลือก ไม่ส่งเฉลย เพื่อกันการดูเฉลยจากฝั่งเบราว์เซอร์ */
function apiGetQuiz(token, categoryId) {
  return safe_(function () {
    requireUser(token);
    const cat = categoryById(String(categoryId));
    if (!cat) return fail('ไม่พบหมวดหมู่ที่เลือก');
    const qs = findAll(SHEETS.QUESTIONS, 'category_id', categoryId)
      .filter(function (q) { return q.is_active !== false; })
      .sort(function (a, b) { return Number(a.order_no) - Number(b.order_no); })
      .map(function (q) {
        return {
          question_id: q.question_id,
          question_text: q.question_text,
          choices: [q.choice_a, q.choice_b, q.choice_c, q.choice_d],
        };
      });
    if (!qs.length) return fail('ยังไม่มีข้อสอบในหมวดนี้');
    return ok({ category: cat, questions: qs }, 'โหลดข้อสอบสำเร็จ');
  });
}

/**
 * ตรวจข้อสอบ บันทึกผล และให้คะแนน
 * answers = [{ question_id, selected }] โดย selected เป็น 'A'|'B'|'C'|'D' หรือ '' เมื่อไม่ตอบ
 */
function apiSubmitQuiz(token, categoryId, answers, durationSeconds) {
  return safe_(function () {
    const user = requireUser(token);
    const cat = categoryById(String(categoryId));
    if (!cat) return fail('ไม่พบหมวดหมู่ที่เลือก');
    answers = answers || [];

    const bank = {};
    findAll(SHEETS.QUESTIONS, 'category_id', categoryId).forEach(function (q) {
      bank[String(q.question_id)] = q;
    });

    const resultId = uuid('QR');
    const review = [];
    const answerRows = [];
    let score = 0;

    answers.forEach(function (a) {
      const q = bank[String(a.question_id)];
      if (!q) return;
      const correct = String(q.correct_answer).toUpperCase();
      const selected = String(a.selected || '').toUpperCase();
      const isCorrect = selected === correct;
      if (isCorrect) score++;
      answerRows.push({
        answer_id: uuid('QA'),
        result_id: resultId,
        user_id: user.user_id,
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
        selected: selected,
        correct: correct,
        is_correct: isCorrect,
        explanation: q.explanation,
      });
    });

    const total = Object.keys(bank).length;
    const percent = total ? Math.round((score / total) * 100) : 0;
    const passed = percent >= APP.passPercent;

    let points = score * POINTS.QUIZ_PER_CORRECT;
    if (passed) points += POINTS.QUIZ_PASS_BONUS;
    if (percent >= 100) points += POINTS.QUIZ_PERFECT_BONUS;

    appendRow(SHEETS.QUIZ_RESULTS, {
      result_id: resultId,
      user_id: user.user_id,
      category_id: categoryId,
      score: score,
      total: total,
      percent: percent,
      passed: passed,
      points: points,
      duration_seconds: Number(durationSeconds) || 0,
      created_at: now(),
    });
    appendRows(SHEETS.QUIZ_ANSWERS, answerRows);
    addPoints_(user.user_id, 'quiz', 'ทำ Quiz หมวด ' + cat.name + ' ได้ ' + score + '/' + total, points);
    const reward = evaluateRewards_(user.user_id);

    return ok({
      score: score,
      total: total,
      percent: percent,
      passed: passed,
      points: points,
      review: review,
      newBadges: reward.badges,
      newMissions: reward.missions,
      dashboard: buildDashboard_(findOne(SHEETS.USERS, 'user_id', user.user_id)),
    }, passed ? 'ยินดีด้วย ผ่านเกณฑ์แล้ว' : 'ยังไม่ผ่านเกณฑ์ ลองทบทวนแล้วทำใหม่ได้');
  });
}

function apiQuizHistory(token) {
  return safe_(function () {
    const user = requireUser(token);
    const rows = findAll(SHEETS.QUIZ_RESULTS, 'user_id', user.user_id)
      .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
      .slice(0, 30)
      .map(function (r) {
        const c = categoryById(String(r.category_id)) || {};
        return {
          category_id: r.category_id,
          category_name: c.name || r.category_id,
          icon: c.icon || 'fa-clipboard',
          color: c.color || '#4361ee',
          score: Number(r.score), total: Number(r.total), percent: Number(r.percent),
          passed: r.passed === true || String(r.passed).toUpperCase() === 'TRUE',
          points: Number(r.points),
          created_at: String(r.created_at),
        };
      });
    return ok({ history: rows }, 'โหลดประวัติสำเร็จ');
  });
}

/* ============================ อันดับ ============================ */

function apiLeaderboard(token) {
  return safe_(function () {
    const me = requireUser(token);
    const quizzes = readAll(SHEETS.QUIZ_RESULTS);
    const badges = readAll(SHEETS.USER_BADGES);
    const quizCount = {}, badgeCount = {};
    quizzes.forEach(function (q) { quizCount[q.user_id] = (quizCount[q.user_id] || 0) + 1; });
    badges.forEach(function (b) { badgeCount[b.user_id] = (badgeCount[b.user_id] || 0) + 1; });

    const rows = readAll(SHEETS.USERS)
      .map(function (u) {
        const p = Number(u.total_points) || 0;
        return {
          user_id: u.user_id,
          display_name: u.display_name,
          picture_url: u.picture_url,
          points: p,
          level: levelOf(p).level,
          level_name: levelOf(p).name,
          streak: Number(u.streak_days) || 0,
          quizzes: quizCount[u.user_id] || 0,
          badges: badgeCount[u.user_id] || 0,
          isMe: u.user_id === me.user_id,
        };
      })
      .sort(function (a, b) { return b.points - a.points || b.badges - a.badges; });

    rows.forEach(function (r, i) { r.rank = i + 1; });
    const myRow = rows.filter(function (r) { return r.isMe; })[0] || null;
    return ok({ top: rows.slice(0, 30), me: myRow, total: rows.length }, 'โหลดอันดับสำเร็จ');
  });
}

/* ============================ คะแนน / เหรียญ / ภารกิจ ============================ */

function addPoints_(uid, source, detail, points) {
  points = Number(points) || 0;
  const u = findOne(SHEETS.USERS, 'user_id', uid);
  const balance = (Number(u.total_points) || 0) + points;
  updateRowById(SHEETS.USERS, 'user_id', uid, {
    total_points: balance,
    level: levelOf(balance).level,
  });
  appendRow(SHEETS.POINTS_LOG, {
    log_id: uuid('PL'),
    user_id: uid,
    source: source,
    detail: detail,
    points: points,
    balance_after: balance,
    created_at: now(),
  });
  return balance;
}

/** ตัวเลขที่ใช้เทียบกับเงื่อนไขของเหรียญและภารกิจ */
function progressValue_(stats, type) {
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

/** ตรวจเงื่อนไขทั้งหมด มอบเหรียญและภารกิจที่เพิ่งสำเร็จ คืนรายการใหม่เพื่อแจ้งผู้เรียน */
function evaluateRewards_(uid) {
  const user = findOne(SHEETS.USERS, 'user_id', uid);
  const stats = userStats_(user);

  const ownedBadges = {};
  findAll(SHEETS.USER_BADGES, 'user_id', uid).forEach(function (b) { ownedBadges[String(b.badge_id)] = true; });
  const newBadges = [];
  readAll(SHEETS.BADGES).forEach(function (b) {
    if (b.is_active === false) return;
    if (ownedBadges[String(b.badge_id)]) return;
    if (progressValue_(stats, b.condition_type) >= Number(b.condition_value)) {
      appendRow(SHEETS.USER_BADGES, {
        user_badge_id: uuid('UB'), user_id: uid, badge_id: b.badge_id, earned_at: now(),
      });
      if (Number(b.points) > 0) {
        addPoints_(uid, 'badge', 'ได้รับเหรียญ ' + b.badge_name, Number(b.points));
        stats.points += Number(b.points);
      }
      newBadges.push({ badge_id: b.badge_id, name: b.badge_name, description: b.description, icon: b.icon, color: b.color, points: Number(b.points) });
    }
  });

  const ownedMissions = {};
  findAll(SHEETS.USER_MISSIONS, 'user_id', uid).forEach(function (m) { ownedMissions[String(m.mission_id)] = true; });
  const newMissions = [];
  readAll(SHEETS.MISSIONS).forEach(function (m) {
    if (m.is_active === false) return;
    if (ownedMissions[String(m.mission_id)]) return;
    if (progressValue_(stats, m.condition_type) >= Number(m.condition_value)) {
      appendRow(SHEETS.USER_MISSIONS, {
        user_mission_id: uuid('UM'), user_id: uid, mission_id: m.mission_id, completed_at: now(),
      });
      if (Number(m.points) > 0) {
        addPoints_(uid, 'mission', 'ทำภารกิจสำเร็จ ' + m.mission_name, Number(m.points));
        stats.points += Number(m.points);
      }
      newMissions.push({ mission_id: m.mission_id, name: m.mission_name, description: m.description, icon: m.icon, points: Number(m.points) });
    }
  });

  return { badges: newBadges, missions: newMissions };
}

function allBadges_(uid) {
  const user = findOne(SHEETS.USERS, 'user_id', uid);
  const stats = userStats_(user);
  const owned = {};
  findAll(SHEETS.USER_BADGES, 'user_id', uid).forEach(function (b) { owned[String(b.badge_id)] = String(b.earned_at); });
  return readAll(SHEETS.BADGES)
    .filter(function (b) { return b.is_active !== false; })
    .map(function (b) {
      const need = Number(b.condition_value);
      const have = progressValue_(stats, b.condition_type);
      return {
        badge_id: b.badge_id, name: b.badge_name, description: b.description,
        icon: b.icon, color: b.color, points: Number(b.points),
        earned: !!owned[String(b.badge_id)],
        earned_at: owned[String(b.badge_id)] || '',
        progress: Math.min(100, need ? Math.round((have / need) * 100) : 0),
        have: Math.min(have, need), need: need,
      };
    });
}

function allMissions_(uid) {
  const user = findOne(SHEETS.USERS, 'user_id', uid);
  const stats = userStats_(user);
  const owned = {};
  findAll(SHEETS.USER_MISSIONS, 'user_id', uid).forEach(function (m) { owned[String(m.mission_id)] = String(m.completed_at); });
  return readAll(SHEETS.MISSIONS)
    .filter(function (m) { return m.is_active !== false; })
    .map(function (m) {
      const need = Number(m.condition_value);
      const have = progressValue_(stats, m.condition_type);
      return {
        mission_id: m.mission_id, name: m.mission_name, description: m.description,
        icon: m.icon, points: Number(m.points),
        earned: !!owned[String(m.mission_id)],
        completed_at: owned[String(m.mission_id)] || '',
        progress: Math.min(100, need ? Math.round((have / need) * 100) : 0),
        have: Math.min(have, need), need: need,
      };
    });
}
