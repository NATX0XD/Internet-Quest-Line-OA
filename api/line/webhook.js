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
import {
  reply, textMessage, withQuickReply,
  leaderboardCarousel, progressCard, welcomeCard,
  helpCard, linkCard, needLoginCard,
} from '../../lib/push.js';
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

function matches(text, words) {
  return words.some((w) => text.includes(w));
}

async function handleText(event) {
  const lineUserId = event.source?.userId;
  const text = String(event.message?.text || '').trim().toLowerCase();

  if (matches(text, ['ช่วยเหลือ', 'ช่วย', 'help', 'เมนู', 'คำสั่ง', 'ทำอะไรได้'])) {
    return [helpCard()];
  }

  if (matches(text, ['เช็คอิน', 'checkin', 'check in'])) {
    return [linkCard({
      header: 'เช็คอินประจำวัน',
      color: '#4361EE',
      title: 'รับแต้มวันนี้',
      subtitle: 'เช็คอินต่อเนื่องยิ่งหลายวัน ยิ่งได้แต้มโบนัสมากขึ้น สูงสุด 60 แต้มต่อวัน',
      label: 'ไปหน้าเช็คอิน',
      path: '/#checkin',
    })];
  }
  if (matches(text, ['ควิซ', 'quiz', 'แบบทดสอบ', 'ข้อสอบ'])) {
    return [linkCard({
      header: 'แบบทดสอบ',
      color: '#560BAD',
      title: '6 หมวด 60 ข้อ',
      subtitle: 'ทำหมวดละ 10 ข้อ ส่งแล้วเห็นเฉลยพร้อมเหตุผลทุกข้อ ผ่านเกณฑ์ 60% รับแต้มโบนัส',
      label: 'เลือกหมวดที่จะทำ',
      path: '/#quiz',
    })];
  }
  if (matches(text, ['บทเรียน', 'เรียน', 'lesson'])) {
    return [linkCard({
      header: 'บทเรียน',
      color: '#4895EF',
      title: '6 หน่วยการเรียน',
      subtitle: 'อินเทอร์เน็ตเบื้องต้น เว็บเบราว์เซอร์ การสืบค้น อีเมลและธุรกรรม สื่อสังคมออนไลน์ และความปลอดภัย',
      label: 'เปิดบทเรียน',
      path: '/#lesson',
    })];
  }

  const wantsRank = matches(text, ['อันดับ', 'rank', 'leaderboard', 'กระดาน', 'ที่เท่าไร']);
  const wantsPoints = matches(text, ['แต้ม', 'คะแนน', 'point', 'score', 'ความคืบหน้า']);
  if (!wantsRank && !wantsPoints) {
    return [
      textMessage('ยังไม่รู้จักคำนี้ ลองเลือกจากเมนูด้านล่างดูนะ'),
      helpCard(),
    ];
  }

  const userId = lineUserId ? await userIdByLineId(lineUserId) : null;
  if (!userId) return [needLoginCard()];

  if (wantsRank) {
    const board = await leaderboard(userId);
    if (!board.top.length) {
      return [textMessage('ยังไม่มีผู้เรียนคนไหนในระบบ เป็นคนแรกเลยไหม')];
    }
    return [leaderboardCarousel(board.top, board.me)];
  }

  return [progressCard(await getDashboard(userId))];
}

async function handleEvent(event) {
  try {
    if (event.type === 'follow') {
      // ผู้ใช้เพิ่งกด add friend ทักทายและบอกวิธีใช้
      return [welcomeCard('ผู้เรียน'), helpCard()];
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
    if (messages.length && event.replyToken) {
      await reply(event.replyToken, withQuickReply(messages));
    }
  }

  res.status(200).send('ok');
}
