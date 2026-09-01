/**
 * lib/push.js
 * ส่งข้อความแจ้งเตือนเข้าแชท LINE ของผู้เรียนรายบุคคล (Push message + Flex message)
 *
 * ต้องตั้ง environment variable `LINE_MESSAGING_TOKEN` เป็น channel access token
 * ของ Messaging API channel ที่ผูกกับ LINE OA เดียวกัน
 * ถ้าไม่ได้ตั้งค่า ระบบจะข้ามการส่งเงียบ ๆ ทุกฟังก์ชันในไฟล์นี้จึงเรียกได้เสมอ
 *
 * ข้อควรรู้
 * - ผู้เรียนต้องเป็นเพื่อนกับ OA ก่อน ไม่งั้น LINE ตอบ 403
 * - LINE Login channel กับ OA ต้องอยู่ provider เดียวกัน userId จึงจะตรงกัน
 * - ทุกข้อความนับรวมในโควตาข้อความรายเดือนของแผนที่ใช้อยู่ จึงส่งเฉพาะเรื่องสำคัญ
 */

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const SITE = 'https://internet-quest.vercel.app';

const BRAND = {
  blue: '#4361EE',
  purple: '#7209B7',
  pink: '#B5179E',
  gold: '#B8860B',
  green: '#16A34A',
  grey: '#6B7280',
};

function token() {
  return process.env.LINE_MESSAGING_TOKEN || '';
}

/**
 * ส่งข้อความและกลืน error ทั้งหมด
 * การแจ้งเตือนล้มเหลวต้องไม่ทำให้การเช็คอินหรือส่งข้อสอบพัง
 * แต่ยังบันทึกลง log ไว้ให้ตรวจสอบได้ ไม่ปล่อยเงียบ
 */
export async function push(lineUserId, messages) {
  if (!token() || !lineUserId || !messages?.length) return false;
  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: lineUserId, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[push] LINE ตอบ', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[push] ส่งข้อความไม่สำเร็จ:', err.message);
    return false;
  }
}

/* -------------------- ชิ้นส่วนของการ์ด -------------------- */

function row(label, value, valueColor = '#1B1B2F') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: BRAND.grey, flex: 3 },
      { type: 'text', text: String(value), size: 'sm', weight: 'bold', color: valueColor, flex: 4, align: 'end', wrap: true },
    ],
  };
}

function card({ header, headerColor, title, subtitle, rows = [], footerLabel, footerUri, altText }) {
  return {
    type: 'flex',
    altText: altText || title,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerColor,
        paddingAll: '14px',
        contents: [
          { type: 'text', text: header, color: '#FFFFFF', size: 'sm', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: title, size: 'xl', weight: 'bold', color: headerColor, wrap: true },
          ...(subtitle ? [{ type: 'text', text: subtitle, size: 'sm', color: BRAND.grey, wrap: true }] : []),
          ...(rows.length ? [{ type: 'separator', margin: 'md' }] : []),
          ...(rows.length ? [{ type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: rows }] : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: headerColor,
            height: 'sm',
            action: { type: 'uri', label: footerLabel || 'เปิดเว็บเรียน', uri: footerUri || SITE },
          },
        ],
      },
    },
  };
}

/* -------------------- การ์ดแต่ละเหตุการณ์ -------------------- */

/** ทักทายครั้งแรกที่ผูกบัญชีเข้าระบบ */
export function welcomeCard(displayName) {
  return card({
    header: 'ยินดีต้อนรับ',
    headerColor: BRAND.purple,
    title: `สวัสดี ${displayName}`,
    subtitle: 'บัญชี LINE ของคุณเชื่อมกับระบบเรียบร้อยแล้ว ผลการเรียนทั้งหมดจะถูกบันทึกไว้ให้อัตโนมัติ',
    rows: [
      row('บทเรียน', '6 หน่วย'),
      row('แบบทดสอบ', '6 หมวด หมวดละ 10 ข้อ'),
      row('เหรียญตรา', '12 ใบ'),
    ],
    footerLabel: 'เริ่มเรียนเลย',
    altText: `ยินดีต้อนรับสู่ Internet Quest คุณ ${displayName}`,
  });
}

/** สรุปผลการเช็คอินประจำวัน */
export function checkinCard({ points, bonus, streak, balance, level }) {
  return card({
    header: 'เช็คอินสำเร็จ',
    headerColor: BRAND.blue,
    title: `+${points} แต้ม`,
    subtitle: bonus > 0 ? `รวมโบนัสสตรีคต่อเนื่อง ${bonus} แต้ม` : 'พรุ่งนี้เช็คอินต่อเพื่อรับโบนัสเพิ่ม',
    rows: [
      row('เช็คอินต่อเนื่อง', `${streak} วัน`, BRAND.pink),
      row('คะแนนสะสม', `${Number(balance).toLocaleString()} แต้ม`, BRAND.gold),
      row('ระดับปัจจุบัน', `Lv.${level.level} ${level.name}`, BRAND.purple),
    ],
    footerLabel: 'ดูความคืบหน้า',
    footerUri: `${SITE}/#checkin`,
    altText: `เช็คอินสำเร็จ +${points} แต้ม สตรีค ${streak} วัน`,
  });
}

/** สรุปผลการทำแบบทดสอบ */
export function quizCard({ categoryName, score, total, percent, passed, points, balance }) {
  return card({
    header: passed ? 'ผ่านเกณฑ์แล้ว' : 'ยังไม่ผ่านเกณฑ์',
    headerColor: passed ? BRAND.green : BRAND.pink,
    title: `${score}/${total} คิดเป็น ${percent}%`,
    subtitle: categoryName,
    rows: [
      row('ผลการสอบ', passed ? 'ผ่าน' : 'ยังไม่ผ่าน (เกณฑ์ 60%)', passed ? BRAND.green : '#DC2626'),
      row('แต้มที่ได้', `+${points}`, BRAND.gold),
      row('คะแนนสะสม', `${Number(balance).toLocaleString()} แต้ม`, BRAND.gold),
    ],
    footerLabel: passed ? 'ทำหมวดอื่นต่อ' : 'ทบทวนแล้วลองใหม่',
    footerUri: `${SITE}/#quiz`,
    altText: `ผลแบบทดสอบ ${categoryName} ได้ ${score}/${total}`,
  });
}

/** แจ้งเหรียญตราที่เพิ่งได้รับ รวมเป็นการ์ดเดียวเพื่อไม่ให้ยิงหลายข้อความ */
export function badgeCard(badges) {
  const names = badges.map((b) => b.name).join(', ');
  return card({
    header: 'ได้รับเหรียญตราใหม่',
    headerColor: BRAND.gold,
    title: badges.length === 1 ? badges[0].name : `ได้รับ ${badges.length} เหรียญ`,
    subtitle: badges.length === 1 ? badges[0].description : names,
    rows: badges.slice(0, 4).map((b) => row(b.name, `+${b.points} แต้ม`, BRAND.gold)),
    footerLabel: 'ดูเหรียญทั้งหมด',
    footerUri: `${SITE}/#badge`,
    altText: `ได้รับเหรียญตราใหม่ ${names}`,
  });
}
