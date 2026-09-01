/** Utils.gs — ฟังก์ชันช่วยเหลือทั่วไป */

function ok(data, message) {
  return { success: true, message: message || '', data: data || {} };
}

function fail(message, data) {
  return { success: false, message: message || 'เกิดข้อผิดพลาด', data: data || {} };
}

function uuid(prefix) {
  const s = Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  return (prefix || 'ID') + '-' + s;
}

function now() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

function today() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}

function dateString(d) {
  return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
}

/** ผลต่างเป็นจำนวนวันระหว่างสตริงวันที่ 2 ค่า (yyyy-MM-dd) */
function diffDays(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;
  const a = new Date(String(fromYmd).substring(0, 10) + 'T00:00:00+07:00');
  const b = new Date(String(toYmd).substring(0, 10) + 'T00:00:00+07:00');
  return Math.round((b - a) / 86400000);
}

function newToken() {
  return Utilities.base64EncodeWebSafe(
    Utilities.getUuid() + '|' + new Date().getTime() + '|' + Utilities.getUuid()
  ).replace(/=+$/, '');
}

function sessionExpiredAt() {
  const d = new Date();
  d.setDate(d.getDate() + APP.sessionDays);
  return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

function isExpired(value) {
  if (!value) return true;
  const t = new Date(String(value).replace(' ', 'T') + '+07:00').getTime();
  return isNaN(t) ? true : t < new Date().getTime();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** ระดับผู้เรียนจากคะแนนสะสม พร้อมข้อมูล progress ไปยังระดับถัดไป */
function levelOf(points) {
  points = Number(points) || 0;
  let cur = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) cur = LEVELS[i];
  const next = LEVELS.find(function (l) { return l.min > points; }) || null;
  const span = next ? (next.min - cur.min) : 1;
  const gained = next ? (points - cur.min) : 1;
  return {
    level: cur.level,
    name: cur.name,
    icon: cur.icon,
    min: cur.min,
    nextName: next ? next.name : 'ระดับสูงสุด',
    nextAt: next ? next.min : null,
    percent: next ? Math.max(0, Math.min(100, Math.round((gained / span) * 100))) : 100,
    remain: next ? Math.max(0, next.min - points) : 0,
  };
}

function categoryById(id) {
  return CATEGORIES.filter(function (c) { return c.id === id; })[0] || null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
