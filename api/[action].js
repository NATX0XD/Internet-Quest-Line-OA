/**
 * api/[action].js
 * รวมทุก endpoint ของแอปไว้ในฟังก์ชันเดียว (Vercel นับเป็น 1 serverless function)
 *
 *   GET  /api/config       ค่าตั้งต้นสำหรับหน้าเว็บ ไม่ต้องเข้าสู่ระบบ
 *   GET  /api/me           ข้อมูลแดชบอร์ดของผู้เรียน
 *   POST /api/checkin      เช็คอินประจำวัน
 *   GET  /api/lessons      รายการบทเรียน
 *   POST /api/lessons      บันทึกว่าเรียนจบ { lesson_id }
 *   GET  /api/quiz?category=U1     โจทย์ 10 ข้อ (ไม่มีเฉลย)
 *   POST /api/quiz         ส่งคำตอบ { category, answers, seconds }
 *   GET  /api/history      ประวัติการทำ Quiz
 *   GET  /api/leaderboard  อันดับคะแนน
 *   POST /api/setup?key=   สร้างชีตและข้อมูลตั้งต้น (ใช้ ADMIN_KEY)
 */

import { APP, CATEGORIES, SHEETS, BADGE_SEED, MISSION_SEED } from '../lib/config.js';
import { currentUserId } from '../lib/session.js';
import { ok, fail, readBody } from '../lib/util.js';
import { readAll, appendRows, ensureSheets } from '../lib/sheets.js';
import { QUESTIONS } from '../data/questions.js';
import { LESSONS } from '../data/lessons.js';
import {
  getDashboard, checkin, getLessons, completeLesson,
  getQuiz, submitQuiz, quizHistory, leaderboard,
} from '../lib/store.js';

export default async function handler(req, res) {
  const action = String(req.query.action || '');

  try {
    /* ---------- เส้นทางสาธารณะ ---------- */
    if (action === 'config') {
      return ok(res, {
        app: APP,
        categories: CATEGORIES,
        liffId: process.env.LIFF_ID || '',
        loggedIn: !!currentUserId(req),
      });
    }

    if (action === 'setup') return await setup(req, res);

    /* ---------- ต้องเข้าสู่ระบบ ---------- */
    const userId = currentUserId(req);
    if (!userId) return fail(res, 401, 'ยังไม่ได้เข้าสู่ระบบ');

    switch (action) {
      case 'me':
        return ok(res, await getDashboard(userId));

      case 'checkin': {
        if (req.method !== 'POST') return fail(res, 405, 'ต้องเรียกด้วยเมธอด POST');
        const result = await checkin(userId);
        return ok(res, result, 'เช็คอินสำเร็จ');
      }

      case 'lessons': {
        if (req.method === 'GET') return ok(res, { lessons: await getLessons(userId) });
        const body = await readBody(req);
        if (!body.lesson_id) return fail(res, 400, 'ไม่พบรหัสบทเรียน');
        const result = await completeLesson(userId, body.lesson_id);
        return ok(res, result, result.already ? 'บทเรียนนี้เรียนจบแล้ว' : 'เรียนจบบทเรียนแล้ว');
      }

      case 'quiz': {
        if (req.method === 'GET') {
          const category = String(req.query.category || '');
          return ok(res, await getQuiz(category));
        }
        const body = await readBody(req);
        if (!body.category) return fail(res, 400, 'ไม่พบหมวดหมู่');
        const result = await submitQuiz(userId, body.category, body.answers || [], body.seconds);
        return ok(res, result, result.message);
      }

      case 'history':
        return ok(res, { history: await quizHistory(userId) });

      case 'leaderboard':
        return ok(res, await leaderboard(userId));

      default:
        return fail(res, 404, 'ไม่พบเส้นทางนี้');
    }
  } catch (err) {
    return fail(res, err.status || 500, err.message || String(err));
  }
}

/* ============================================================
   ติดตั้งฐานข้อมูล — สร้างชีตที่ยังไม่มีและใส่ข้อมูลตั้งต้น
   เรียกซ้ำได้ ไม่เขียนทับข้อมูลเดิม
   ============================================================ */
async function setup(req, res) {
  const key = process.env.ADMIN_KEY;
  if (!key) return fail(res, 500, 'ยังไม่ได้ตั้งค่า ADMIN_KEY');
  if (String(req.query.key || '') !== key) return fail(res, 403, 'ADMIN_KEY ไม่ถูกต้อง');

  const created = await ensureSheets();
  const report = { createdSheets: created, seeded: {} };

  if (!(await readAll(SHEETS.BADGES)).length) {
    report.seeded.badges = await appendRows(SHEETS.BADGES, BADGE_SEED.map((b) => ({
      badge_id: b[0], badge_name: b[1], description: b[2], icon: b[3], color: b[4],
      condition_type: b[5], condition_value: b[6], points: b[7], is_active: true,
    })));
  }

  if (!(await readAll(SHEETS.MISSIONS)).length) {
    report.seeded.missions = await appendRows(SHEETS.MISSIONS, MISSION_SEED.map((m) => ({
      mission_id: m[0], mission_name: m[1], description: m[2], icon: m[3],
      condition_type: m[4], condition_value: m[5], points: m[6], is_active: true,
    })));
  }

  if (!(await readAll(SHEETS.LESSONS)).length) {
    report.seeded.lessons = await appendRows(SHEETS.LESSONS, LESSONS.map((l, i) => ({
      lesson_id: l.id,
      category_id: l.id,
      title: l.title,
      hours: l.hours,
      summary: l.summary,
      objectives: l.objectives.join('\n'),
      content_html: l.html,
      order_no: i + 1,
      is_active: true,
    })));
  }

  if (!(await readAll(SHEETS.QUESTIONS)).length) {
    const rows = [];
    for (const cat of Object.keys(QUESTIONS)) {
      QUESTIONS[cat].forEach((q, i) => {
        rows.push({
          question_id: `${cat}-Q${String(i + 1).padStart(2, '0')}`,
          category_id: cat,
          question_text: q.q,
          choice_a: q.c[0],
          choice_b: q.c[1],
          choice_c: q.c[2],
          choice_d: q.c[3],
          correct_answer: ['A', 'B', 'C', 'D'][q.a],
          explanation: q.e,
          order_no: i + 1,
          is_active: true,
        });
      });
    }
    report.seeded.questions = await appendRows(SHEETS.QUESTIONS, rows);
  }

  return ok(res, report, 'ติดตั้งฐานข้อมูลเรียบร้อย');
}
