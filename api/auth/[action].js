/**
 * api/auth/[action].js
 * รวมทุกเส้นทางของการเข้าสู่ระบบไว้ในฟังก์ชันเดียว
 *   GET  /api/auth/login     พาไปหน้า login ของ LINE
 *   GET  /api/auth/callback  รับ code กลับมา เปิดเซสชัน แล้วส่งกลับหน้าแรก
 *   POST /api/auth/liff      เข้าสู่ระบบด้วย ID Token จาก LIFF
 *   GET  /api/auth/logout    ออกจากระบบ
 */

import { buildAuthUrl, newState, profileFromCode, profileFromIdToken } from '../../lib/line.js';
import { upsertUser } from '../../lib/store.js';
import { createSession, setSessionCookie, clearSessionCookie, readCookie } from '../../lib/session.js';
import { ok, fail, readBody } from '../../lib/util.js';

const STATE_COOKIE = 'iq_state';

function stateCookie(value, maxAge) {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** หน้าแจ้งข้อผิดพลาดของการเข้าสู่ระบบ พร้อมปุ่มลองใหม่ */
function errorPage(res, message) {
  res.status(400);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>เข้าสู่ระบบไม่สำเร็จ</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6fc;display:flex;min-height:100vh;
align-items:center;justify-content:center;margin:0;padding:20px}
.b{background:#fff;border-radius:20px;padding:30px;max-width:420px;text-align:center;
box-shadow:0 12px 34px rgba(67,97,238,.18)}
h1{font-size:19px;color:#7209b7;margin:0 0 10px}p{color:#6b7280;font-size:14px;line-height:1.8}
a{display:inline-block;margin-top:14px;background:#06c755;color:#fff;text-decoration:none;
padding:11px 22px;border-radius:12px;font-weight:700}</style></head>
<body><div class="b"><h1>เข้าสู่ระบบไม่สำเร็จ</h1><p>${String(message).replace(/</g, '&lt;')}</p>
<a href="/api/auth/login">ลองใหม่อีกครั้ง</a></div></body></html>`);
}

export default async function handler(req, res) {
  const action = String(req.query.action || '');

  try {
    if (action === 'login') {
      const state = newState();
      res.setHeader('Set-Cookie', stateCookie(state, 600));
      res.writeHead(302, { Location: buildAuthUrl(req, state) });
      res.end();
      return;
    }

    if (action === 'callback') {
      if (req.query.error) {
        return errorPage(res, 'LINE ปฏิเสธการเข้าสู่ระบบ: ' + (req.query.error_description || req.query.error));
      }
      const code = String(req.query.code || '');
      if (!code) return errorPage(res, 'ไม่พบรหัสยืนยันจาก LINE');

      const expected = readCookie(req, STATE_COOKIE);
      if (!expected || expected !== String(req.query.state || '')) {
        return errorPage(res, 'state ไม่ตรงกันหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      }

      const profile = await profileFromCode(req, code);
      const userId = await upsertUser(profile);

      res.setHeader('Set-Cookie', [
        stateCookie('', 0),
        `iq_session=${encodeURIComponent(createSession(userId))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`,
      ]);
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    if (action === 'liff') {
      if (req.method !== 'POST') return fail(res, 405, 'ต้องเรียกด้วยเมธอด POST');
      const body = await readBody(req);
      if (!body.idToken) return fail(res, 400, 'ไม่พบ ID Token');

      const profile = await profileFromIdToken(body.idToken);
      const userId = await upsertUser(profile);
      setSessionCookie(res, createSession(userId));
      return ok(res, { userId }, 'เข้าสู่ระบบสำเร็จ');
    }

    if (action === 'logout') {
      clearSessionCookie(res);
      if (req.method === 'POST') return ok(res, {}, 'ออกจากระบบแล้ว');
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    return fail(res, 404, 'ไม่พบเส้นทางนี้');
  } catch (err) {
    if (action === 'login' || action === 'callback') return errorPage(res, err.message || String(err));
    return fail(res, err.status || 500, err.message || String(err));
  }
}
