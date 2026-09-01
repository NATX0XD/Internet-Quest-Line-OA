/** lib/util.js — ตัวช่วยทั่วไป */

import crypto from 'node:crypto';
import { APP } from './config.js';

export function uuid(prefix = 'ID') {
  return prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

const fmtDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP.timeZone,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

/** 'yyyy-MM-dd HH:mm:ss' ตามเวลาไทย */
export function now() {
  const p = Object.fromEntries(fmtDateTime.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** 'yyyy-MM-dd' ตามเวลาไทย */
export function dateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function today() {
  return dateString();
}

/** จำนวนวันระหว่างสตริงวันที่สองค่า */
export function diffDays(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;
  const a = Date.parse(String(fromYmd).slice(0, 10) + 'T00:00:00+07:00');
  const b = Date.parse(String(toYmd).slice(0, 10) + 'T00:00:00+07:00');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function isTrue(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/* -------------------- ตอบกลับแบบ JSON -------------------- */

export function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

export function ok(res, data, message = '') {
  sendJson(res, 200, { success: true, message, data: data || {} });
}

export function fail(res, status, message) {
  sendJson(res, status, { success: false, message, data: {} });
}

/** อ่าน body ของคำขอ รองรับทั้งกรณีที่ Vercel แปลงให้แล้วและยังไม่แปลง */
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
