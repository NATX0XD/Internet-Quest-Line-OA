/**
 * lib/session.js
 * เซสชันเก็บใน cookie ที่เซ็นด้วย HMAC-SHA256
 * ไม่ต้องมีฐานข้อมูลเซสชัน และ cookie ถูกแก้ไขไม่ได้เพราะลายเซ็นจะไม่ตรง
 */

import crypto from 'node:crypto';
import { APP } from './config.js';

const COOKIE = 'iq_session';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('ยังไม่ได้ตั้งค่า SESSION_SECRET (ต้องยาวอย่างน้อย 16 ตัวอักษร)');
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

export function createSession(userId) {
  const body = b64url(JSON.stringify({
    uid: userId,
    exp: Date.now() + APP.sessionDays * 86400000,
  }));
  return `${body}.${sign(body)}`;
}

export function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = sign(body);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function readCookie(req, name = COOKIE) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function setSessionCookie(res, token) {
  const maxAge = APP.sessionDays * 86400;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/** คืน userId จาก cookie หรือ null เมื่อยังไม่ได้เข้าสู่ระบบ */
export function currentUserId(req) {
  const data = verifySession(readCookie(req));
  return data ? data.uid : null;
}
