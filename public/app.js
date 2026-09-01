/* =========================================================
   app.js — ตรรกะฝั่งเบราว์เซอร์
   คุยกับ serverless function ผ่าน fetch เซสชันอยู่ใน cookie แบบ HttpOnly
   ========================================================= */

var STATE = {
  cfg: null,
  dash: null,
  lessons: null,
  quiz: null,       // { category, questions, answers, index, startedAt }
  charts: {},
};

var LETTERS = ['A', 'B', 'C', 'D'];

/* -------------------- ตัวช่วย -------------------- */
function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** เรียก API คืนเฉพาะส่วน data โยน error พร้อมข้อความจากเซิร์ฟเวอร์เมื่อไม่สำเร็จ */
async function api(path, options) {
  var res = await fetch('/api/' + path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  }, options || {}));

  var body;
  try { body = await res.json(); } catch (e) { body = {}; }

  if (!res.ok || body.success === false) {
    var err = new Error(body.message || ('คำขอไม่สำเร็จ (' + res.status + ')'));
    err.status = res.status;
    throw err;
  }
  return body.data;
}

function post(path, payload) {
  return api(path, { method: 'POST', body: JSON.stringify(payload || {}) });
}

function toastErr(text) {
  Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: text, confirmButtonColor: '#7209b7' });
}
function busy(title) {
  Swal.fire({ title: title || 'กำลังทำงาน...', allowOutsideClick: false, didOpen: function () { Swal.showLoading(); } });
}
function defaultPic(name) {
  return 'https://ui-avatars.com/api/?background=7209b7&color=fff&bold=true&name=' + encodeURIComponent(name || 'U');
}

/* =========================================================
   เข้าสู่ระบบ
   ========================================================= */
function goLine() {
  el('loginStatus').classList.add('d-none');
  el('loginBtn').classList.remove('d-none');
  location.href = '/api/auth/login';
}

function showLoginError(msg) {
  var box = el('loginError');
  box.textContent = msg;
  box.classList.remove('d-none');
  el('loginStatus').classList.add('d-none');
  el('loginBtn').classList.remove('d-none');
}

async function boot() {
  try {
    STATE.cfg = await api('config');
  } catch (err) {
    showLoginError(err.message);
    return;
  }

  if (STATE.cfg.loggedIn) {
    loadDashboard();
    return;
  }

  // เปิดจากแอป LINE ผ่าน LIFF จะเข้าสู่ระบบได้ทันทีโดยไม่ต้องเปลี่ยนหน้า
  if (STATE.cfg.liffId && typeof liff !== 'undefined') {
    try {
      await liff.init({ liffId: STATE.cfg.liffId });
      if (liff.isLoggedIn()) {
        var idToken = liff.getIDToken();
        if (idToken) {
          await post('auth/liff', { idToken: idToken });
          loadDashboard();
          return;
        }
      }
    } catch (e) { /* ตกไปใช้ทางเข้าสู่ระบบปกติ */ }
  }

  goLine();
}

async function loadDashboard() {
  el('loginStatus').classList.remove('d-none');
  el('loginStatus').innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังโหลดข้อมูลผู้เรียน...';
  try {
    var d = await api('me');
    onDashboard(d);
    el('loginScreen').style.display = 'none';
    el('app').classList.remove('d-none');
    openTabFromHash();
  } catch (err) {
    if (err.status === 401) { goLine(); return; }
    showLoginError(err.message);
  }
}

function doLogout() {
  Swal.fire({
    title: 'ออกจากระบบ', text: 'ต้องการออกจากระบบใช่หรือไม่',
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#7209b7',
  }).then(function (r) {
    if (!r.isConfirmed) return;
    try { if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) liff.logout(); } catch (e) {}
    location.href = '/api/auth/logout';
  });
}

/* =========================================================
   แดชบอร์ด
   ========================================================= */
function onDashboard(d) {
  STATE.dash = d;
  var u = d.user;

  el('pfPic').src = u.picture_url || defaultPic(u.display_name);
  el('pfPic').onerror = function () { this.src = defaultPic(u.display_name); };
  el('pfName').textContent = u.display_name;
  el('pfPoints').textContent = Number(d.points).toLocaleString();
  el('pfLevelBadge').textContent = 'Lv.' + d.level.level;
  el('pfLevelName').innerHTML = '<i class="fa-solid ' + d.level.icon + '"></i> ' + esc(d.level.name);

  el('lvFrom').textContent = 'Lv.' + d.level.level + ' ' + d.level.name;
  el('lvTo').textContent = d.level.nextAt ? ('Lv.' + (d.level.level + 1) + ' ' + d.level.nextName) : 'ระดับสูงสุด';
  el('lvBar').style.width = d.level.percent + '%';
  el('lvRemain').textContent = d.level.nextAt
    ? ('อีก ' + d.level.remain.toLocaleString() + ' แต้มถึงระดับถัดไป')
    : 'ถึงระดับสูงสุดแล้ว';

  el('stLessons').textContent = d.counters.lessonsDone + '/' + d.counters.lessonsTotal;
  el('stMissions').textContent = d.counters.missionsDone + '/' + d.counters.missionsTotal;
  el('stBadges').textContent = d.counters.badgesDone;
  el('stRank').textContent = d.rank ? ('#' + d.rank) : '-';

  renderCheckin(d);
  renderMissions(d.missions);
  renderBadges(d.badges);
  renderQuizCategories(d.categories);
  drawCheckinChart(d.checkinHistory);
  drawCategoryChart(d.categories);
}

/* =========================================================
   แท็บ
   ========================================================= */
var TABS = ['checkin', 'lesson', 'quiz', 'badge', 'rank'];

function switchTab(name, scroll) {
  if (TABS.indexOf(name) < 0) return;
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  TABS.forEach(function (t) { el('tab-' + t).classList.toggle('d-none', t !== name); });
  if (scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'lesson' && !STATE.lessons) loadLessons();
  if (name === 'rank') loadLeaderboard();
  if (name === 'quiz') loadHistory();
}

document.addEventListener('click', function (e) {
  var btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
  history.replaceState(null, '', '#' + btn.dataset.tab);
});

/** เปิดแท็บตาม hash เพื่อให้ปุ่มใน Rich Menu ของ LINE ลิงก์ตรงเข้าแต่ละหน้าได้ */
function openTabFromHash() {
  var name = (location.hash || '').replace('#', '');
  if (TABS.indexOf(name) >= 0) switchTab(name, false);
}

window.addEventListener('hashchange', openTabFromHash);

/* =========================================================
   เช็คอิน
   ========================================================= */
function renderCheckin(d) {
  el('ckStreak').textContent = d.streak;
  var btn = el('ckBtn');
  if (d.checkedInToday) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> วันนี้เช็คอินแล้ว';
    el('ckHint').textContent = 'พรุ่งนี้กลับมาเช็คอินต่อเพื่อรักษาสตรีคและรับแต้มโบนัสเพิ่ม';
  } else {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-hand-sparkles"></i> เช็คอินวันนี้';
    el('ckHint').textContent = 'เช็คอินต่อเนื่องยิ่งหลายวัน ยิ่งได้แต้มโบนัสมากขึ้น';
  }
}

async function doCheckin() {
  el('ckBtn').disabled = true;
  busy('กำลังเช็คอิน...');
  try {
    var d = await post('checkin');
    Swal.close();
    onDashboard(d.dashboard);
    await Swal.fire({
      icon: 'success',
      title: '+' + d.points + ' แต้ม',
      html: 'เช็คอินสำเร็จ<br>สตรีคต่อเนื่อง <b>' + d.streak + '</b> วัน'
        + (d.bonus > 0 ? '<br><span class="text-muted small">โบนัสสตรีค +' + d.bonus + ' แต้ม</span>' : ''),
      confirmButtonColor: '#7209b7',
    });
    await announceRewards(d.newBadges, d.newMissions);
  } catch (err) {
    Swal.close();
    el('ckBtn').disabled = false;
    toastErr(err.message);
  }
}

/** แจ้งเหรียญและภารกิจที่เพิ่งได้รับ ทีละใบ */
async function announceRewards(badges, missions) {
  var queue = (badges || []).map(function (b) {
    return { icon: b.icon, color: b.color, kind: 'ได้รับเหรียญใหม่', name: b.name, desc: b.description, points: b.points };
  }).concat((missions || []).map(function (m) {
    return { icon: m.icon, color: '#4361ee', kind: 'ภารกิจสำเร็จ', name: m.name, desc: m.description, points: m.points };
  }));

  for (var i = 0; i < queue.length; i++) {
    var r = queue[i];
    await Swal.fire({
      html:
        '<div style="width:86px;height:86px;margin:6px auto 14px;border-radius:50%;display:flex;'
        + 'align-items:center;justify-content:center;color:#fff;font-size:34px;background:' + r.color + '">'
        + '<i class="fa-solid ' + r.icon + '"></i></div>'
        + '<div style="color:#7209b7;font-weight:800;font-size:13px">' + r.kind + '</div>'
        + '<div style="font-size:20px;font-weight:800;margin:4px 0">' + esc(r.name) + '</div>'
        + '<div style="color:#6b7280;font-size:13px">' + esc(r.desc) + '</div>'
        + (r.points > 0 ? '<div style="margin-top:8px;color:#b8860b;font-weight:700">+' + r.points + ' แต้ม</div>' : ''),
      confirmButtonText: 'เยี่ยมมาก',
      confirmButtonColor: '#7209b7',
    });
  }
}

/* =========================================================
   ภารกิจ / เหรียญ
   ========================================================= */
function renderMissions(list) {
  el('missionList').innerHTML = (list || []).map(function (m) {
    return '<div class="mission-item ' + (m.earned ? 'done' : '') + '">'
      + '<div class="mission-ico"><i class="fa-solid ' + m.icon + '"></i></div>'
      + '<div class="flex-grow-1 min-w-0">'
      + '<div class="mission-name">' + esc(m.name) + (m.earned ? ' <i class="fa-solid fa-circle-check text-success"></i>' : '') + '</div>'
      + '<div class="mission-desc">' + esc(m.description) + '</div>'
      + '<div class="mission-bar"><i style="width:' + m.progress + '%"></i></div>'
      + '<div class="mission-desc mt-1">ความคืบหน้า ' + m.have + '/' + m.need + '</div>'
      + '</div>'
      + '<div class="mission-pts">+' + m.points + '</div>'
      + '</div>';
  }).join('') || '<div class="empty">ยังไม่มีภารกิจ</div>';
}

function renderBadges(list) {
  el('badgeGrid').innerHTML = (list || []).map(function (b, i) {
    return '<div class="badge-item ' + (b.earned ? '' : 'locked') + '" onclick="badgeInfo(' + i + ')">'
      + '<div class="badge-ico" style="background:' + (b.earned ? b.color : '#9ca3af') + '">'
      + '<i class="fa-solid ' + (b.earned ? b.icon : 'fa-lock') + '"></i></div>'
      + '<div class="badge-name">' + esc(b.name) + '</div>'
      + (b.earned
        ? '<div class="badge-mini">ได้รับแล้ว</div>'
        : '<div class="badge-prog"><i style="width:' + b.progress + '%"></i></div>'
          + '<div class="badge-mini">' + b.have + '/' + b.need + '</div>')
      + '</div>';
  }).join('') || '<div class="empty">ยังไม่มีเหรียญในระบบ</div>';
}

function badgeInfo(i) {
  var b = STATE.dash.badges[i];
  if (!b) return;
  Swal.fire({
    html:
      '<div style="width:80px;height:80px;margin:6px auto 14px;border-radius:50%;display:flex;'
      + 'align-items:center;justify-content:center;color:#fff;font-size:32px;background:'
      + (b.earned ? b.color : '#9ca3af') + '"><i class="fa-solid ' + (b.earned ? b.icon : 'fa-lock') + '"></i></div>'
      + '<div style="font-size:19px;font-weight:800">' + esc(b.name) + '</div>'
      + '<div style="color:#6b7280;font-size:13px;margin-top:6px">' + esc(b.description) + '</div>'
      + (b.earned
        ? '<div style="margin-top:10px;color:#16a34a;font-weight:700">ได้รับแล้ว</div>'
        : '<div style="margin-top:10px;color:#6b7280;font-size:13px">ความคืบหน้า ' + b.have + '/' + b.need + '</div>'),
    confirmButtonText: 'ปิด', confirmButtonColor: '#7209b7',
  });
}

/* =========================================================
   บทเรียน
   ========================================================= */
async function loadLessons() {
  el('lessonList').innerHTML = '<div class="empty"><span class="spinner-border spinner-border-sm"></span> กำลังโหลดบทเรียน...</div>';
  try {
    var d = await api('lessons');
    STATE.lessons = d.lessons;
    renderLessons();
  } catch (err) {
    el('lessonList').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
  }
}

function renderLessons() {
  el('lessonList').innerHTML = STATE.lessons.map(function (l, i) {
    return '<div class="card-x lesson-card" style="border-left-color:' + l.color + '">'
      + '<div class="lesson-head">'
      + '<div class="lesson-ico" style="background:' + l.color + '"><i class="fa-solid ' + l.icon + '"></i></div>'
      + '<div class="flex-grow-1">'
      + '<div class="lesson-title">หน่วยที่ ' + (i + 1) + ' ' + esc(l.title) + '</div>'
      + '<div class="lesson-meta">' + l.hours + ' ชั่วโมง · ' + esc(l.summary) + '</div>'
      + '</div>'
      + (l.done ? '<span class="badge-done">เรียนแล้ว</span>' : '')
      + '</div>'
      + '<button class="btn btn-grad w-100 mt-3" onclick="openLesson(' + i + ')">'
      + '<i class="fa-solid fa-book-open"></i> ' + (l.done ? 'ทบทวนอีกครั้ง' : 'เริ่มเรียน') + '</button>'
      + '</div>';
  }).join('');
}

async function openLesson(i) {
  var l = STATE.lessons[i];
  var objectives = l.objectives.length
    ? '<div class="obj-list"><b>จุดประสงค์การเรียนรู้</b><ul class="mb-0 mt-1">'
      + l.objectives.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var r = await Swal.fire({
    title: esc(l.title),
    html: '<div class="lesson-body text-start">' + objectives + l.content_html + '</div>',
    width: 720,
    showCancelButton: true,
    cancelButtonText: 'ปิด',
    confirmButtonText: l.done ? 'เรียนจบแล้ว' : 'ทำเครื่องหมายว่าเรียนจบ (+30 แต้ม)',
    confirmButtonColor: '#7209b7',
    cancelButtonColor: '#9ca3af',
  });
  if (!r.isConfirmed || l.done) return;

  busy('กำลังบันทึก...');
  try {
    var d = await post('lessons', { lesson_id: l.lesson_id });
    Swal.close();
    l.done = true;
    renderLessons();
    onDashboard(d.dashboard);
    await Swal.fire({
      icon: 'success', title: 'เรียนจบหน่วยนี้แล้ว',
      text: d.already ? 'บันทึกไว้ก่อนหน้านี้แล้ว' : '+' + d.points + ' แต้ม',
      confirmButtonColor: '#7209b7',
    });
    await announceRewards(d.newBadges, d.newMissions);
  } catch (err) {
    Swal.close();
    toastErr(err.message);
  }
}

/* =========================================================
   Quiz
   ========================================================= */
function renderQuizCategories(cats) {
  el('quizCatList').innerHTML = (cats || []).map(function (c) {
    var best = c.attempts
      ? '<div class="cat-best" style="color:' + (c.passed ? '#16a34a' : '#dc2626') + '">'
        + 'ดีที่สุด ' + c.bestPercent + '%' + (c.passed ? ' · ผ่าน' : ' · ยังไม่ผ่าน') + '</div>'
      : '<div class="cat-best text-muted">ยังไม่เคยทำ</div>';
    return '<div class="cat-card" onclick="startQuiz(\'' + c.id + '\')">'
      + '<div class="cat-ico" style="background:' + c.color + '"><i class="fa-solid ' + c.icon + '"></i></div>'
      + '<div class="cat-name">' + esc(c.name) + '</div>'
      + '<div class="cat-meta">10 ข้อ · ทำแล้ว ' + c.attempts + ' ครั้ง</div>'
      + best
      + '</div>';
  }).join('');
}

async function loadHistory() {
  try {
    var d = await api('history');
    el('quizHistory').innerHTML = d.history.length ? d.history.map(function (h) {
      return '<div class="history-item">'
        + '<div class="mission-ico" style="background:' + h.color + ';width:32px;height:32px;font-size:13px">'
        + '<i class="fa-solid ' + h.icon + '"></i></div>'
        + '<div class="flex-grow-1 min-w-0">'
        + '<div style="font-weight:700">' + esc(h.category_name) + '</div>'
        + '<div class="rank-sub">' + esc(h.created_at) + '</div></div>'
        + '<div class="text-end">'
        + '<div style="font-weight:800;color:' + (h.passed ? '#16a34a' : '#dc2626') + '">' + h.score + '/' + h.total + '</div>'
        + '<div class="rank-sub">+' + h.points + ' แต้ม</div></div>'
        + '</div>';
    }).join('') : '<div class="empty">ยังไม่มีประวัติการทำ Quiz</div>';
  } catch (err) {
    el('quizHistory').innerHTML = '<div class="empty">โหลดประวัติไม่สำเร็จ</div>';
  }
}

async function startQuiz(categoryId) {
  busy('กำลังโหลดข้อสอบ...');
  try {
    var d = await api('quiz?category=' + encodeURIComponent(categoryId));
    Swal.close();
    STATE.quiz = {
      category: d.category,
      questions: d.questions,
      answers: d.questions.map(function () { return ''; }),
      index: 0,
      startedAt: Date.now(),
    };
    el('quizHome').classList.add('d-none');
    el('quizResult').classList.add('d-none');
    el('quizRunner').classList.remove('d-none');
    renderQuestion();
  } catch (err) {
    Swal.close();
    toastErr(err.message);
  }
}

function renderQuestion() {
  var q = STATE.quiz;
  var item = q.questions[q.index];
  var pct = Math.round(((q.index + 1) / q.questions.length) * 100);

  el('quizRunner').innerHTML =
    '<div class="card-x">'
    + '<div class="d-flex justify-content-between align-items-center mb-2">'
    + '<span class="q-num"><i class="fa-solid ' + q.category.icon + '" style="color:' + q.category.color + '"></i> '
    + esc(q.category.name) + '</span>'
    + '<span class="q-num">ข้อ ' + (q.index + 1) + ' / ' + q.questions.length + '</span>'
    + '</div>'
    + '<div class="q-progress"><i style="width:' + pct + '%"></i></div>'
    + '<div class="q-text">' + esc(item.question_text) + '</div>'
    + item.choices.map(function (c, i) {
        return '<button class="choice ' + (q.answers[q.index] === LETTERS[i] ? 'selected' : '') + '" '
          + 'onclick="pick(' + i + ')">'
          + '<span class="choice-key">' + LETTERS[i] + '</span><span>' + esc(c) + '</span></button>';
      }).join('')
    + '<div class="d-flex gap-2 mt-3">'
    + '<button class="btn btn-outline-secondary flex-grow-1" ' + (q.index === 0 ? 'disabled' : '') + ' onclick="navQ(-1)">'
    + '<i class="fa-solid fa-chevron-left"></i> ก่อนหน้า</button>'
    + (q.index === q.questions.length - 1
      ? '<button class="btn btn-grad flex-grow-1" onclick="submitQuiz()"><i class="fa-solid fa-paper-plane"></i> ส่งคำตอบ</button>'
      : '<button class="btn btn-grad flex-grow-1" onclick="navQ(1)">ถัดไป <i class="fa-solid fa-chevron-right"></i></button>')
    + '</div>'
    + '<button class="btn btn-link w-100 mt-2 text-muted small" onclick="quitQuiz()">ออกจากแบบทดสอบ</button>'
    + '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pick(i) {
  STATE.quiz.answers[STATE.quiz.index] = LETTERS[i];
  renderQuestion();
}

function navQ(step) {
  var q = STATE.quiz;
  var next = q.index + step;
  if (next < 0 || next >= q.questions.length) return;
  q.index = next;
  renderQuestion();
}

function quitQuiz() {
  Swal.fire({
    title: 'ออกจากแบบทดสอบ', text: 'คำตอบที่ทำไว้จะไม่ถูกบันทึก',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'ออก', cancelButtonText: 'ทำต่อ', confirmButtonColor: '#dc2626',
  }).then(function (r) {
    if (!r.isConfirmed) return;
    STATE.quiz = null;
    el('quizRunner').classList.add('d-none');
    el('quizHome').classList.remove('d-none');
  });
}

async function submitQuiz() {
  var q = STATE.quiz;
  var blank = q.answers.filter(function (a) { return !a; }).length;

  if (blank) {
    var confirm = await Swal.fire({
      title: 'ยังตอบไม่ครบ',
      text: 'เหลืออีก ' + blank + ' ข้อที่ยังไม่ได้ตอบ ต้องการส่งคำตอบเลยหรือไม่',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'ส่งเลย', cancelButtonText: 'กลับไปทำต่อ', confirmButtonColor: '#7209b7',
    });
    if (!confirm.isConfirmed) return;
  }

  busy('กำลังตรวจคำตอบ...');
  try {
    var d = await post('quiz', {
      category: q.category.id,
      answers: q.questions.map(function (item, i) {
        return { question_id: item.question_id, selected: q.answers[i] };
      }),
      seconds: Math.round((Date.now() - q.startedAt) / 1000),
    });
    Swal.close();
    onDashboard(d.dashboard);
    showResult(d);
    loadHistory();
  } catch (err) {
    Swal.close();
    toastErr(err.message);
  }
}

async function showResult(d) {
  var categoryId = STATE.quiz.category.id;
  el('quizRunner').classList.add('d-none');
  var box = el('quizResult');
  box.classList.remove('d-none');

  var head =
    '<div class="card-x text-center">'
    + '<div class="score-ring">'
    + '<div class="score-num ' + (d.passed ? 'score-pass' : 'score-fail') + '">' + d.percent + '%</div>'
    + '<div class="text-muted">ตอบถูก ' + d.score + ' จาก ' + d.total + ' ข้อ</div>'
    + '</div>'
    + '<div class="mt-3"><span class="badge-done" style="background:' + (d.passed ? '#dcfce7' : '#fee2e2')
    + ';color:' + (d.passed ? '#15803d' : '#b91c1c') + '">'
    + (d.passed ? 'ผ่านเกณฑ์ 60%' : 'ยังไม่ผ่านเกณฑ์ 60%') + '</span></div>'
    + '<div class="mt-2" style="color:#b8860b;font-weight:700">+' + d.points + ' แต้ม</div>'
    + '<div class="d-flex gap-2 mt-3">'
    + '<button class="btn btn-outline-secondary flex-grow-1" onclick="backToQuizHome()">กลับหน้าหมวด</button>'
    + '<button class="btn btn-grad flex-grow-1" onclick="startQuiz(\'' + categoryId + '\')">ทำใหม่อีกครั้ง</button>'
    + '</div></div>';

  var review = '<h6 class="section-title">เฉลยและเหตุผล</h6>' + d.review.map(function (r, i) {
    var picked = r.selected ? (r.selected + '. ' + r.choices[LETTERS.indexOf(r.selected)]) : 'ไม่ได้ตอบ';
    var answer = r.correct + '. ' + r.choices[LETTERS.indexOf(r.correct)];
    return '<div class="review-item ' + (r.is_correct ? 'correct' : 'wrong') + '">'
      + '<div class="review-q">' + (i + 1) + '. ' + esc(r.question_text) + '</div>'
      + '<div class="review-line">'
      + (r.is_correct
        ? '<i class="fa-solid fa-circle-check text-success"></i> ตอบถูก: <b>' + esc(answer) + '</b>'
        : '<i class="fa-solid fa-circle-xmark text-danger"></i> คำตอบของคุณ: ' + esc(picked)
          + '<br><i class="fa-solid fa-circle-check text-success"></i> คำตอบที่ถูก: <b>' + esc(answer) + '</b>')
      + '</div>'
      + '<div class="review-explain"><b>เหตุผล</b> ' + esc(r.explanation) + '</div>'
      + '</div>';
  }).join('');

  box.innerHTML = head + review;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await announceRewards(d.newBadges, d.newMissions);
}

function backToQuizHome() {
  STATE.quiz = null;
  el('quizResult').classList.add('d-none');
  el('quizHome').classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   อันดับ
   ========================================================= */
async function loadLeaderboard() {
  el('rankList').innerHTML = '<div class="empty"><span class="spinner-border spinner-border-sm"></span> กำลังโหลด...</div>';
  try {
    renderLeaderboard(await api('leaderboard'));
  } catch (err) {
    el('rankList').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
  }
}

function renderLeaderboard(d) {
  var top3 = d.top.slice(0, 3);
  var order = [top3[1], top3[0], top3[2]];   // แสดงอันดับ 2-1-3 ตามรูปแบบโพเดียม
  var stands = ['p2', 'p1', 'p3'];

  el('podium').innerHTML = order.map(function (u, i) {
    if (!u) return '<div class="podium-col"></div>';
    return '<div class="podium-col">'
      + '<img class="podium-img" src="' + (u.picture_url || defaultPic(u.display_name)) + '" '
      + 'onerror="this.src=\'' + defaultPic(u.display_name) + '\'">'
      + '<div class="podium-name">' + esc(u.display_name) + '</div>'
      + '<div class="podium-pts">' + u.points.toLocaleString() + ' แต้ม</div>'
      + '<div class="podium-stand ' + stands[i] + '">#' + u.rank + '</div>'
      + '</div>';
  }).join('');

  el('rankList').innerHTML = d.top.map(function (u) {
    return '<div class="rank-item ' + (u.isMe ? 'me' : '') + '">'
      + '<div class="rank-no">' + (u.rank <= 3 ? ['🥇', '🥈', '🥉'][u.rank - 1] : u.rank) + '</div>'
      + '<img class="rank-img" src="' + (u.picture_url || defaultPic(u.display_name)) + '" '
      + 'onerror="this.src=\'' + defaultPic(u.display_name) + '\'">'
      + '<div class="flex-grow-1 min-w-0">'
      + '<div class="rank-name">' + esc(u.display_name) + (u.isMe ? ' <span class="text-primary small">(คุณ)</span>' : '') + '</div>'
      + '<div class="rank-sub">Lv.' + u.level + ' ' + esc(u.level_name) + ' · ' + u.badges + ' badge · Quiz ' + u.quizzes + ' ครั้ง</div>'
      + '</div>'
      + '<div class="rank-pts">' + u.points.toLocaleString() + '</div>'
      + '</div>';
  }).join('') || '<div class="empty">ยังไม่มีผู้เรียนในระบบ</div>';
}

/* =========================================================
   กราฟ
   ========================================================= */
function drawCheckinChart(history) {
  var ctx = el('chartCheckin');
  if (!ctx) return;
  if (STATE.charts.checkin) STATE.charts.checkin.destroy();
  STATE.charts.checkin = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: history.map(function (h) { return h.label; }),
      datasets: [{
        label: 'แต้มจากการเช็คอิน',
        data: history.map(function (h) { return h.points; }),
        backgroundColor: history.map(function (h) { return h.done ? '#7209b7' : '#e5e7eb'; }),
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (c) { return c.parsed.y + ' แต้ม'; } } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#f0eef9' }, border: { display: false } },
      },
    },
  });
}

function drawCategoryChart(cats) {
  var ctx = el('chartCategory');
  if (!ctx) return;
  if (STATE.charts.category) STATE.charts.category.destroy();
  STATE.charts.category = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: cats.map(function (c) { return c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name; }),
      datasets: [{
        label: 'คะแนนดีที่สุด (%)',
        data: cats.map(function (c) { return c.bestPercent; }),
        backgroundColor: 'rgba(114,9,183,.18)',
        borderColor: '#7209b7',
        pointBackgroundColor: '#4361ee',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, font: { size: 9 }, backdropColor: 'transparent' },
          pointLabels: { font: { size: 9 } },
          grid: { color: '#ece9fb' },
          angleLines: { color: '#ece9fb' },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

/* =========================================================
   เริ่มทำงาน
   ========================================================= */
document.addEventListener('DOMContentLoaded', boot);
