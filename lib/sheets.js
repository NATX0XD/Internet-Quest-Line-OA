/**
 * lib/sheets.js
 * ไคลเอนต์ Google Sheets API v4 แบบไม่ใช้ไลบรารีภายนอก
 * เซ็น JWT ของ Service Account เองด้วย node:crypto เพื่อให้ cold start เร็วที่สุด
 */

import crypto from 'node:crypto';
import { HEADERS } from './config.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/* -------------------- ข้อมูลรับรอง -------------------- */

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const json = JSON.parse(raw);
    return { email: json.client_email, key: json.private_key };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error('ยังไม่ได้ตั้งค่า Service Account — ต้องมี GOOGLE_SERVICE_ACCOUNT_JSON หรือ GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY');
  }
  return { email, key: key.replace(/\\n/g, '\n') };
}

export function sheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID');
  return id;
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** เก็บ access token ไว้ใช้ซ้ำภายใน instance เดียวกัน ลดการเรียก OAuth ทุกครั้ง */
let tokenCache = { value: '', expiresAt: 0 };

async function accessToken() {
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.expiresAt - 60 > nowSec) return tokenCache.value;

  const { email, key } = credentials();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${header}.${claim}`)
    .sign(key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error('ขอ access token จาก Google ไม่สำเร็จ: ' + (body.error_description || body.error || res.status));
  }
  tokenCache = { value: body.access_token, expiresAt: nowSec + (body.expires_in || 3600) };
  return tokenCache.value;
}

async function call(path, { method = 'GET', body, query } = {}) {
  const token = await accessToken();
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${API}/${sheetId()}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error('Google Sheets API: ' + (json.error?.message || res.status));
  }
  return json;
}

/* -------------------- อ่านข้อมูล -------------------- */

const RENDER = { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' };

/** แปลงตาราง 2 มิติเป็น array ของ object โดยใช้แถวแรกเป็นชื่อคอลัมน์ */
function toObjects(values) {
  if (!values || values.length < 2) return [];
  const head = values[0];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[0] === undefined || String(row[0]).trim() === '') continue;
    const o = { __row: r + 1 };
    for (let c = 0; c < head.length; c++) o[head[c]] = row[c] === undefined ? '' : row[c];
    out.push(o);
  }
  return out;
}

export async function readAll(name) {
  const res = await call(`/values/${encodeURIComponent(name)}`, { query: RENDER });
  return toObjects(res.values);
}

/** อ่านหลายชีตพร้อมกันด้วยคำขอเดียว คืนค่าเป็น { ชื่อชีต: [object] } */
export async function readMany(names) {
  const query = new URLSearchParams(RENDER);
  names.forEach((n) => query.append('ranges', n));
  const token = await accessToken();
  const res = await fetch(`${API}/${sheetId()}/values:batchGet?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Google Sheets API: ' + (json.error?.message || res.status));

  const out = {};
  (json.valueRanges || []).forEach((vr, i) => {
    out[names[i]] = toObjects(vr.values);
  });
  names.forEach((n) => { if (!out[n]) out[n] = []; });
  return out;
}

export function where(rows, field, value) {
  return rows.filter((r) => String(r[field]) === String(value));
}

export function findOne(rows, field, value) {
  return rows.find((r) => String(r[field]) === String(value)) || null;
}

/* -------------------- เขียนข้อมูล -------------------- */

function toRow(name, obj) {
  return HEADERS[name].map((h) => (obj[h] === undefined ? '' : obj[h]));
}

export async function appendRows(name, objs) {
  if (!objs || !objs.length) return 0;
  await call(`/values/${encodeURIComponent(name)}:append`, {
    method: 'POST',
    query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
    body: { values: objs.map((o) => toRow(name, o)) },
  });
  return objs.length;
}

export async function appendRow(name, obj) {
  await appendRows(name, [obj]);
  return obj;
}

/**
 * แก้ไขแถวเดิม ต้องส่ง row ที่ได้จาก __row มาด้วย
 * เขียนทับทั้งแถวเพื่อให้เป็นคำขอเดียว
 */
export async function updateRow(name, row, current, patch) {
  const merged = { ...current, ...patch };
  const endCol = colLetter(HEADERS[name].length);
  await call(`/values/${encodeURIComponent(name)}!A${row}:${endCol}${row}`, {
    method: 'PUT',
    query: { valueInputOption: 'RAW' },
    body: { values: [toRow(name, merged)] },
  });
  return merged;
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

/* -------------------- ติดตั้งโครงสร้าง -------------------- */

/** สร้างชีตที่ยังไม่มี พร้อมเขียนหัวตาราง คืนรายชื่อชีตที่เพิ่งสร้าง */
export async function ensureSheets() {
  const meta = await call('', { query: { fields: 'sheets.properties.title' } });
  const existing = new Set((meta.sheets || []).map((s) => s.properties.title));

  const missing = Object.keys(HEADERS).filter((n) => !existing.has(n));
  if (missing.length) {
    await call(':batchUpdate', {
      method: 'POST',
      body: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }

  // เขียนหัวตารางให้ทุกชีต (เขียนทับแถวแรกเสมอ ปลอดภัยเพราะเป็นหัวตารางเดิม)
  const data = Object.keys(HEADERS).map((name) => ({
    range: `${name}!A1:${colLetter(HEADERS[name].length)}1`,
    values: [HEADERS[name]],
  }));
  await call('/values:batchUpdate', {
    method: 'POST',
    body: { valueInputOption: 'RAW', data },
  });

  return missing;
}
