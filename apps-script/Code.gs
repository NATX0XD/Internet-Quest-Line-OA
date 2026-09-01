/**
 * Code.gs — จุดเข้าของ Web App
 * เปิดหน้าเว็บ = พาไป login LINE ทันที เมื่อ LINE ส่งกลับพร้อม code จะเปิด session แล้วเข้าแอป
 */

function doGet(e) {
  e = e || {};
  const p = e.parameter || {};

  if (!cfg('SHEET_ID') || !cfg('LINE_CHANNEL_ID') || !cfg('LINE_CHANNEL_SECRET')) {
    return page_('Setup', { webAppUrl: safeUrl_() });
  }

  // tab ใช้สำหรับลิงก์ตรงจากปุ่มใน Rich Menu เช่น .../exec?tab=quiz
  let boot = { token: '', user: null, error: '', tab: String(p.tab || '') };

  if (p.code) {
    const res = loginWithCode(p.code, p.state);
    if (res.success) {
      boot.token = res.data.token;
      boot.user = res.data.user;
    } else {
      boot.error = res.message;
    }
  } else if (p.error) {
    boot.error = 'LINE ปฏิเสธการเข้าสู่ระบบ: ' + (p.error_description || p.error);
  }

  return page_('Index', {
    boot: boot,
    authUrl: cfg('LINE_CHANNEL_ID') ? buildLineAuthUrl() : '',
    liffId: cfg('LIFF_ID'),
    app: APP,
    categories: CATEGORIES,
  });
}

function page_(name, vars) {
  const t = HtmlService.createTemplateFromFile(name);
  Object.keys(vars || {}).forEach(function (k) { t[k] = vars[k]; });
  return t.evaluate()
    .setTitle(APP.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function safeUrl_() {
  try { return webAppUrl(); } catch (err) { return ''; }
}

/* ------------------------------------------------------------------
   ฟังก์ชันติดตั้งครั้งเดียว — เปิด Apps Script Editor แล้วรันจากเมนู
   ------------------------------------------------------------------ */

/**
 * ตั้งค่าทั้งหมดในครั้งเดียว
 * แก้ค่าใน 4 บรรทัดด้านล่างให้เป็นของตนเอง แล้วกด Run
 */
function initProject() {
  setConfig('LINE_CHANNEL_ID', 'ใส่_Channel_ID_ของ_LINE_Login');
  setConfig('LINE_CHANNEL_SECRET', 'ใส่_Channel_Secret');
  setConfig('LIFF_ID', '');                 // ไม่บังคับ ใส่เมื่อมี LIFF
  setConfig('WEBAPP_URL', '');              // เว้นว่างได้ ระบบจะใช้ URL ของ deployment ปัจจุบัน

  const info = setupDatabase();
  Logger.log('ติดตั้งฐานข้อมูลเสร็จแล้ว');
  Logger.log('Spreadsheet: ' + info.url);
  Logger.log('Callback URL ที่ต้องใส่ใน LINE Developers: ' + safeUrl_());
  return info;
}

/** แสดงค่าตั้งค่าปัจจุบัน (ซ่อน secret) */
function showConfig() {
  const out = {
    SHEET_ID: cfg('SHEET_ID'),
    LINE_CHANNEL_ID: cfg('LINE_CHANNEL_ID'),
    LINE_CHANNEL_SECRET: cfg('LINE_CHANNEL_SECRET') ? '(ตั้งค่าแล้ว)' : '(ยังไม่ตั้ง)',
    LIFF_ID: cfg('LIFF_ID'),
    CALLBACK_URL: safeUrl_(),
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
