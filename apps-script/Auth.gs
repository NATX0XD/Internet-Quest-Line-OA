/**
 * Auth.gs — เข้าสู่ระบบด้วยบัญชี LINE
 *
 * รองรับ 2 ทาง
 *  1) LINE Login (OAuth 2.1 authorization code) — ใช้ได้ทุกเบราว์เซอร์ ทั้งมือถือและคอมพิวเตอร์
 *  2) LIFF ID Token — ใช้เมื่อเปิดจากแอป LINE ผ่านลิงก์ LIFF (ข้ามขั้นตอน redirect)
 * ทั้งสองทางจบที่การสร้าง session_token เก็บในชีต Users
 */

const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

function webAppUrl() {
  const configured = cfg('WEBAPP_URL');
  if (configured) return configured;
  return ScriptApp.getService().getUrl();
}

/** สร้าง URL สำหรับพาผู้ใช้ไปหน้า login ของ LINE */
function buildLineAuthUrl() {
  const channelId = cfg('LINE_CHANNEL_ID');
  if (!channelId) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
  const state = uuid('ST');
  CacheService.getScriptCache().put('state_' + state, '1', 600);
  const params = {
    response_type: 'code',
    client_id: channelId,
    redirect_uri: webAppUrl(),
    state: state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  };
  const qs = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return LINE_AUTH_URL + '?' + qs;
}

/** แลก authorization code เป็น access token + โปรไฟล์ แล้วเปิด session */
function loginWithCode(code, state) {
  if (!code) return fail('ไม่พบรหัสยืนยันจาก LINE');
  if (state && !CacheService.getScriptCache().get('state_' + state)) {
    // state หมดอายุหรือถูกใช้ไปแล้ว ไม่ปิดกั้นการใช้งาน แต่บันทึกไว้
    Logger.log('warn: state ไม่ตรงหรือหมดอายุ');
  }
  const res = UrlFetchApp.fetch(LINE_TOKEN_URL, {
    method: 'post',
    payload: {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: webAppUrl(),
      client_id: cfg('LINE_CHANNEL_ID'),
      client_secret: cfg('LINE_CHANNEL_SECRET'),
    },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !body.access_token) {
    return fail('แลกโทเคนกับ LINE ไม่สำเร็จ: ' + (body.error_description || body.error || res.getContentText()));
  }

  const pRes = UrlFetchApp.fetch(LINE_PROFILE_URL, {
    headers: { Authorization: 'Bearer ' + body.access_token },
    muteHttpExceptions: true,
  });
  if (pRes.getResponseCode() !== 200) return fail('ดึงโปรไฟล์ LINE ไม่สำเร็จ');
  const profile = JSON.parse(pRes.getContentText());

  return openSession({
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    statusMessage: profile.statusMessage,
  });
}

/** ตรวจสอบ ID Token จาก LIFF แล้วเปิด session (เรียกจากฝั่งหน้าเว็บ) */
function apiLoginWithIdToken(idToken) {
  try {
    if (!idToken) return fail('ไม่พบ ID Token');
    const res = UrlFetchApp.fetch(LINE_VERIFY_URL, {
      method: 'post',
      payload: { id_token: idToken, client_id: cfg('LINE_CHANNEL_ID') },
      muteHttpExceptions: true,
    });
    const body = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200 || !body.sub) {
      return fail('ตรวจสอบ ID Token ไม่ผ่าน: ' + (body.error_description || body.error || ''));
    }
    return openSession({
      lineUserId: body.sub,
      displayName: body.name || 'ผู้เรียน',
      pictureUrl: body.picture || '',
      statusMessage: '',
    });
  } catch (err) {
    return fail('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
}

/** สร้างหรืออัปเดตผู้ใช้ แล้วออก session token */
function openSession(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let user = findOne(SHEETS.USERS, 'line_user_id', p.lineUserId);
    const token = newToken();
    const patch = {
      display_name: p.displayName || 'ผู้เรียน',
      picture_url: p.pictureUrl || '',
      status_message: p.statusMessage || '',
      session_token: token,
      session_expired_at: sessionExpiredAt(),
      last_login: now(),
    };
    if (user) {
      user = updateRowById(SHEETS.USERS, 'user_id', user.user_id, patch);
    } else {
      user = Object.assign({
        user_id: uuid('U'),
        line_user_id: p.lineUserId,
        total_points: 0,
        level: 1,
        streak_days: 0,
        last_checkin_date: '',
        created_at: now(),
      }, patch);
      appendRow(SHEETS.USERS, user);
    }
    return ok({ token: token, user: publicUser(user) }, 'เข้าสู่ระบบสำเร็จ');
  } finally {
    lock.releaseLock();
  }
}

function publicUser(u) {
  return {
    user_id: u.user_id,
    display_name: u.display_name,
    picture_url: u.picture_url,
    total_points: Number(u.total_points) || 0,
    streak_days: Number(u.streak_days) || 0,
    last_checkin_date: u.last_checkin_date ? String(u.last_checkin_date).substring(0, 10) : '',
  };
}

function getUserByToken(token) {
  if (!token) return null;
  const u = findOne(SHEETS.USERS, 'session_token', token);
  if (!u) return null;
  if (isExpired(u.session_expired_at)) return null;
  return u;
}

function requireUser(token) {
  const u = getUserByToken(token);
  if (!u) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
  return u;
}

function apiLogout(token) {
  const u = getUserByToken(token);
  if (u) updateRowById(SHEETS.USERS, 'user_id', u.user_id, { session_token: '', session_expired_at: '' });
  return ok({}, 'ออกจากระบบแล้ว');
}
