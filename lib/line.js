/**
 * lib/line.js — LINE Login (OAuth 2.1) และการตรวจ ID Token จาก LIFF
 */

import crypto from 'node:crypto';

const AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const PROFILE_URL = 'https://api.line.me/v2/profile';

export function channelId() {
  const v = process.env.LINE_CHANNEL_ID;
  if (!v) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
  return v;
}

function channelSecret() {
  const v = process.env.LINE_CHANNEL_SECRET;
  if (!v) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET');
  return v;
}

/**
 * URL ของเว็บนี้ ใช้ประกอบ redirect_uri
 * ตั้ง PUBLIC_URL ไว้ใน environment variable เพื่อให้ตรงกับ Callback URL ใน LINE เสมอ
 * (โดเมน preview ของ Vercel เปลี่ยนทุก deploy จึงห้ามอาศัย host จากคำขอในโหมด production)
 */
export function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export function redirectUri(req) {
  return baseUrl(req) + '/api/auth/callback';
}

export function buildAuthUrl(req, state) {
  const params = {
    response_type: 'code',
    client_id: channelId(),
    redirect_uri: redirectUri(req),
    state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  };
  // เข้ารหัสเองเพื่อให้เว้นวรรคใน scope เป็น %20 ตามตัวอย่างของ LINE
  // (URLSearchParams จะได้ + ซึ่ง LINE ไม่ได้ระบุว่ารองรับ)
  const qs = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
  return `${AUTH_URL}?${qs}`;
}

export function newState() {
  return crypto.randomBytes(16).toString('hex');
}

/** แลก authorization code เป็นโปรไฟล์ผู้ใช้ */
export async function profileFromCode(req, code) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(req),
      client_id: channelId(),
      client_secret: channelSecret(),
    }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) {
    throw new Error('แลกโทเคนกับ LINE ไม่สำเร็จ: ' + (token.error_description || token.error || tokenRes.status));
  }

  const profRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profRes.ok) throw new Error('ดึงโปรไฟล์ LINE ไม่สำเร็จ');
  const p = await profRes.json();

  return {
    lineUserId: p.userId,
    displayName: p.displayName || 'ผู้เรียน',
    pictureUrl: p.pictureUrl || '',
    statusMessage: p.statusMessage || '',
  };
}

/** ตรวจสอบ ID Token ที่ได้จาก LIFF กับเซิร์ฟเวอร์ของ LINE */
export async function profileFromIdToken(idToken) {
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId() }),
  });
  const body = await res.json();
  if (!res.ok || !body.sub) {
    throw new Error('ตรวจสอบ ID Token ไม่ผ่าน: ' + (body.error_description || body.error || res.status));
  }
  return {
    lineUserId: body.sub,
    displayName: body.name || 'ผู้เรียน',
    pictureUrl: body.picture || '',
    statusMessage: '',
  };
}
