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
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
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

/**
 * ตอบกลับข้อความที่ผู้ใช้พิมพ์เข้ามา
 * ใช้ reply token ซึ่งไม่นับรวมในโควตาข้อความรายเดือนของ LINE OA
 * ต่างจาก push ที่นับทุกข้อความ จึงควรใช้ reply เมื่อทำได้
 */
export async function reply(replyToken, messages) {
  if (!token() || !replyToken || !messages?.length) return false;
  try {
    const res = await fetch(REPLY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[reply] LINE ตอบ', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[reply] ตอบกลับไม่สำเร็จ:', err.message);
    return false;
  }
}

export function textMessage(text) {
  return { type: 'text', text: String(text).slice(0, 4999) };
}

/* -------------------- ปุ่มลัดใต้ช่องพิมพ์ -------------------- */

const QUICK_ITEMS = [
  { label: '🏆 อันดับ', text: 'อันดับ' },
  { label: '💎 แต้มของฉัน', text: 'แต้ม' },
  { label: '📅 เช็คอิน', text: 'เช็คอิน' },
  { label: '📝 ควิซ', text: 'ควิซ' },
  { label: '📘 บทเรียน', text: 'บทเรียน' },
  { label: '❓ ช่วยเหลือ', text: 'ช่วยเหลือ' },
];

/**
 * แนบปุ่มลัดไว้กับข้อความสุดท้าย
 * LINE แสดง quick reply ของข้อความล่าสุดเท่านั้น ผู้เรียนจึงกดต่อได้โดยไม่ต้องพิมพ์
 */
export function withQuickReply(messages) {
  if (!messages?.length) return messages;
  const last = messages[messages.length - 1];
  last.quickReply = {
    items: QUICK_ITEMS.map((q) => ({
      type: 'action',
      action: { type: 'message', label: q.label, text: q.text },
    })),
  };
  return messages;
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

/* -------------------- การ์ดคำสั่งและสถานะ -------------------- */

/** หนึ่งบรรทัดในเมนูช่วยเหลือ: ป้ายคำสั่งสีพื้น ตามด้วยคำอธิบาย */
function commandRow(keyword, description, color) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '86px',
        cornerRadius: '14px',
        backgroundColor: color,
        paddingAll: '6px',
        contents: [
          { type: 'text', text: keyword, size: 'xs', weight: 'bold', color: '#FFFFFF', align: 'center' },
        ],
      },
      { type: 'text', text: description, size: 'xs', color: '#4B5563', wrap: true, flex: 1 },
    ],
  };
}

/** เมนูช่วยเหลือ บอกว่าพิมพ์อะไรได้บ้าง */
export function helpCard() {
  return {
    type: 'flex',
    altText: 'พิมพ์อะไรได้บ้าง — อันดับ แต้ม เช็คอิน ควิซ บทเรียน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BRAND.purple,
        paddingAll: '16px',
        spacing: 'xs',
        contents: [
          { type: 'text', text: 'Internet Quest', size: 'xs', color: '#E9D5FF', weight: 'bold' },
          { type: 'text', text: 'พิมพ์อะไรได้บ้าง', size: 'xl', color: '#FFFFFF', weight: 'bold' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'พิมพ์คำด้านล่าง หรือกดปุ่มลัดใต้ช่องพิมพ์ได้เลย',
            size: 'xs', color: BRAND.grey, wrap: true,
          },
          { type: 'separator', margin: 'sm' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            margin: 'md',
            contents: [
              commandRow('อันดับ', 'กระดานอันดับ เลื่อนดูการ์ดของแต่ละคนได้', BRAND.pink),
              commandRow('แต้ม', 'คะแนนสะสม ระดับ สตรีค และเหรียญของคุณ', BRAND.purple),
              commandRow('เช็คอิน', 'เปิดหน้าเช็คอินรับแต้มประจำวัน', BRAND.blue),
              commandRow('ควิซ', 'แบบทดสอบ 6 หมวด หมวดละ 10 ข้อ พร้อมเฉลย', '#560BAD'),
              commandRow('บทเรียน', 'เนื้อหาทั้ง 6 หน่วยของรายวิชา', '#4895EF'),
              commandRow('ช่วยเหลือ', 'แสดงเมนูนี้อีกครั้ง', '#6B7280'),
            ],
          },
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
            color: BRAND.purple,
            height: 'sm',
            action: { type: 'uri', label: 'เปิดเว็บเรียน', uri: SITE },
          },
        ],
      },
    },
  };
}

/** การ์ดลิงก์ไปยังหน้าใดหน้าหนึ่งของเว็บ */
export function linkCard({ header, title, subtitle, label, path, color }) {
  return card({
    header,
    headerColor: color,
    title,
    subtitle,
    footerLabel: label,
    footerUri: `${SITE}${path}`,
    altText: `${title} — ${SITE}${path}`,
  });
}

/** ยังไม่เคยเข้าเว็บ จึงยังไม่มีข้อมูลให้แสดง */
export function needLoginCard() {
  return card({
    header: 'ยังไม่พบข้อมูลของคุณ',
    headerColor: BRAND.pink,
    title: 'เข้าสู่ระบบก่อนหนึ่งครั้ง',
    subtitle: 'กดปุ่มด้านล่างแล้วเข้าสู่ระบบด้วยบัญชี LINE นี้ จากนั้นกลับมาพิมพ์ถามได้เลย ข้อมูลจะถูกบันทึกให้อัตโนมัติ',
    footerLabel: 'เข้าสู่ระบบด้วย LINE',
    altText: 'ยังไม่พบข้อมูลของคุณ กรุณาเข้าสู่ระบบก่อน',
  });
}

/* -------------------- การ์ดอันดับแบบเลื่อนซ้ายขวา -------------------- */

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = ['#FFB703', '#8B9CF7', '#E08E56'];

function avatarUrl(u) {
  if (u.picture_url && String(u.picture_url).startsWith('https://')) return u.picture_url;
  return 'https://ui-avatars.com/api/?background=7209B7&color=fff&bold=true&size=512&name='
    + encodeURIComponent(u.display_name || 'U');
}

/** การ์ดผู้เรียนหนึ่งคนในกระดานอันดับ */
function learnerBubble(u, highlight) {
  const accent = RANK_COLORS[u.rank - 1] || (highlight ? BRAND.purple : BRAND.blue);
  const rankLabel = u.rank <= 3 ? `${MEDALS[u.rank - 1]} อันดับ ${u.rank}` : `อันดับ ${u.rank}`;

  return {
    type: 'bubble',
    size: 'micro',
    hero: {
      type: 'image',
      url: avatarUrl(u),
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      backgroundColor: highlight ? '#F5EDFF' : '#FFFFFF',
      contents: [
        { type: 'text', text: rankLabel, size: 'xs', weight: 'bold', color: accent },
        {
          type: 'text',
          text: u.display_name + (highlight ? ' (คุณ)' : ''),
          size: 'sm', weight: 'bold', wrap: true, maxLines: 2, color: '#1B1B2F',
        },
        { type: 'text', text: `Lv.${u.level} ${u.level_name}`, size: 'xxs', color: BRAND.grey, wrap: true },
        {
          type: 'text',
          text: `${Number(u.points).toLocaleString()} แต้ม`,
          size: 'sm', weight: 'bold', color: BRAND.purple, margin: 'sm',
        },
        {
          type: 'text',
          text: `🏅 ${u.badges} เหรียญ · 📝 ${u.quizzes} ครั้ง`,
          size: 'xxs', color: BRAND.grey,
        },
      ],
    },
  };
}

/**
 * กระดานอันดับแบบ carousel เลื่อนดูทีละคนได้
 * LINE จำกัด 12 bubble ต่อ carousel จึงตัดที่ 10 คนแล้วต่อท้ายด้วยการ์ดสรุปของผู้เรียนเอง
 */
export function leaderboardCarousel(top, me) {
  const list = top.slice(0, 10);
  const bubbles = list.map((u) => learnerBubble(u, u.isMe));

  // ถ้าผู้เรียนไม่ติด 10 อันดับแรก ต่อการ์ดของตัวเองไว้ท้ายสุดเพื่อให้เห็นตำแหน่งตัวเอง
  if (me && !list.some((u) => u.isMe)) bubbles.push(learnerBubble(me, true));

  bubbles.push({
    type: 'bubble',
    size: 'micro',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '14px',
      justifyContent: 'center',
      contents: [
        { type: 'text', text: 'ไต่อันดับ', size: 'sm', weight: 'bold', color: BRAND.purple },
        { type: 'text', text: 'เช็คอินทุกวันและทำ Quiz ให้ผ่านเกณฑ์ เพื่อสะสมแต้มแซงเพื่อน', size: 'xxs', color: BRAND.grey, wrap: true },
        {
          type: 'button',
          style: 'primary',
          color: BRAND.purple,
          height: 'sm',
          action: { type: 'uri', label: 'เปิดเว็บ', uri: `${SITE}/#rank` },
        },
      ],
    },
  });

  return {
    type: 'flex',
    altText: me ? `กระดานอันดับ คุณอยู่อันดับ ${me.rank} จาก ${top.length} คน` : 'กระดานอันดับผู้เรียน',
    contents: { type: 'carousel', contents: bubbles.slice(0, 12) },
  };
}

/** สรุปความคืบหน้าของผู้เรียนคนเดียว ใช้ตอบเมื่อพิมพ์ถามแต้ม */
export function progressCard(dash) {
  return card({
    header: 'ความคืบหน้าของคุณ',
    headerColor: BRAND.purple,
    title: `${Number(dash.points).toLocaleString()} แต้ม`,
    subtitle: `Lv.${dash.level.level} ${dash.level.name}` +
      (dash.level.nextAt ? ` · อีก ${dash.level.remain.toLocaleString()} แต้มถึงระดับถัดไป` : ' · ระดับสูงสุดแล้ว'),
    rows: [
      row('อันดับ', dash.rank ? `ที่ ${dash.rank} จาก ${dash.totalLearners} คน` : 'ยังไม่จัดอันดับ', BRAND.pink),
      row('เช็คอินต่อเนื่อง', `${dash.streak} วัน`),
      row('บทเรียนที่จบ', `${dash.counters.lessonsDone}/${dash.counters.lessonsTotal} หน่วย`),
      row('เหรียญตรา', `${dash.counters.badgesDone}/${dash.counters.badgesTotal} ใบ`, BRAND.gold),
    ],
    footerLabel: 'เปิดเว็บเรียน',
    altText: `คุณมี ${dash.points} แต้ม อันดับที่ ${dash.rank}`,
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
