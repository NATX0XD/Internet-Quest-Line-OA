/**
 * api/line/webhook.js
 * รับเหตุการณ์จาก LINE Messaging API แล้วตอบกลับด้วย reply token
 *
 * ตั้ง Webhook URL ที่ LINE Developers Console (Messaging API channel) เป็น
 *   https://<โดเมน>/api/line/webhook
 * และต้องตั้ง environment variable
 *   LINE_MESSAGING_TOKEN          channel access token ของ Messaging API channel
 *   LINE_MESSAGING_CHANNEL_SECRET channel secret ของ channel เดียวกัน (ใช้ตรวจลายเซ็น)
 *
 * การใช้ reply token ไม่นับรวมในโควตาข้อความรายเดือนของ LINE OA
 */

import crypto from 'node:crypto';
import { reply, textMessage, leaderboardCarousel, progressCard, welcomeCard } from '../../lib/push.js';
import { userIdByLineId, leaderboard, getDashboard } from '../../lib/store.js';

// ปิดการแปลง body อัตโนมัติ เพราะการตรวจลายเซ็นต้องใช้ข้อมูลดิบตรงตามที่ LINE ส่งมา
export const config = { api: { bodyParser: false } };

const SITE = 'https://internet-quest.vercel.app';

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  // เผื่อกรณี runtime แปลง body ให้แล้ว จะได้ยังตรวจลายเซ็นต่อได้
  if (req.body) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return '';
}

function validSignature(body, signature) {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* -------------------- คำสั่งที่รองรับ -------------------- */

const HELP = [
  'พิมพ์คำเหล่านี้เพื่อดูข้อมูลได้เลย',
  '',
  '• อันดับ — ดูกระดานอันดับแบบเลื่อนดูทีละคน',
  '• แต้ม — ดูคะแนนสะสมและความคืบหน้าของตัวเอง',
  '• เช็คอิน — เปิดหน้าเช็คอินประจำวัน',
  '• ควิซ — เปิดหน้าแบบทดสอบ',
  '• บทเรียน — เปิดบทเรียนทั้ง 6 หน่วย',
].join('\n');

function matches(text, words) {
  return words.some((w) => text.includes(w));
}

async function handleText(event) {
  const lineUserId = event.source?.userId;
  const text = String(event.message?.text || '').trim().toLowerCase();

  if (matches(text, ['ช่วย', 'help', 'เมนู', 'คำสั่ง', 'ทำอะไรได้'])) {
    return [textMessage(HELP)];
  }

  if (matches(text, ['เช็คอิน', 'checkin', 'check in'])) {
    return [textMessage(`เช็คอินรับแต้มประจำวันที่นี่\n${SITE}/#checkin`)];
  }
  if (matches(text, ['ควิซ', 'quiz', 'แบบทดสอบ', 'ข้อสอบ'])) {
    return [textMessage(`ทำแบบทดสอบ 6 หมวด หมวดละ 10 ข้อ พร้อมเฉลย\n${SITE}/#quiz`)];
  }
  if (matches(text, ['บทเรียน', 'เรียน', 'lesson'])) {
    return [textMessage(`บทเรียนทั้ง 6 หน่วย\n${SITE}/#lesson`)];
  }

  const wantsRank = matches(text, ['อันดับ', 'rank', 'leaderboard', 'กระดาน', 'ที่เท่าไร']);
  const wantsPoints = matches(text, ['แต้ม', 'คะแนน', 'point', 'score', 'ความคืบหน้า']);
  if (!wantsRank && !wantsPoints) {
    return [textMessage(`ไม่เข้าใจคำสั่งนี้\n\n${HELP}`)];
  }

  const userId = lineUserId ? await userIdByLineId(lineUserId) : null;
  if (!userId) {
    return [textMessage(
      'ยังไม่พบข้อมูลของคุณในระบบ\n\n' +
      `เข้าเว็บแล้วกดเข้าสู่ระบบด้วย LINE หนึ่งครั้งก่อน จากนั้นกลับมาพิมพ์ใหม่ได้เลย\n${SITE}`
    )];
  }

  if (wantsRank) {
    const board = await leaderboard(userId);
    if (!board.top.length) return [textMessage('ยังไม่มีผู้เรียนในระบบ')];
    return [leaderboardCarousel(board.top, board.me)];
  }

  return [progressCard(await getDashboard(userId))];
}

async function handleEvent(event) {
  try {
    if (event.type === 'follow') {
      // ผู้ใช้เพิ่งกด add friend ทักทายและบอกวิธีใช้
      return [
        welcomeCard('ผู้เรียน'),
        textMessage(HELP),
      ];
    }
    if (event.type === 'message' && event.message?.type === 'text') {
      return await handleText(event);
    }
    return [];
  } catch (err) {
    console.error('[webhook] จัดการเหตุการณ์ไม่สำเร็จ:', err.message);
    return [textMessage('ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งในสักครู่')];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('ต้องเรียกด้วยเมธอด POST');
    return;
  }

  const body = await rawBody(req);
  if (!validSignature(body, req.headers['x-line-signature'])) {
    console.error('[webhook] ลายเซ็นไม่ถูกต้อง ปฏิเสธคำขอ');
    res.status(403).send('invalid signature');
    return;
  }

  // ตอบ 200 ให้ LINE ก่อนเสมอ ไม่ว่าจะประมวลผลสำเร็จหรือไม่
  // เพราะ LINE จะรีทรายและปิด webhook อัตโนมัติถ้าได้สถานะผิดพลาดบ่อย ๆ
  let events = [];
  try {
    events = JSON.parse(body).events || [];
  } catch {
    res.status(200).send('ok');
    return;
  }

  for (const event of events) {
    const messages = await handleEvent(event);
    if (messages.length && event.replyToken) await reply(event.replyToken, messages);
  }

  res.status(200).send('ok');
}
