/**
 * Database.gs — ชั้นเชื่อมต่อ Google Sheets
 * รันฟังก์ชัน setupDatabase() หนึ่งครั้งเพื่อสร้างชีต หัวตาราง และข้อมูลตั้งต้นทั้งหมด
 */

function ss() {
  const id = cfg('SHEET_ID');
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID — ให้รันฟังก์ชัน setupDatabase() ก่อน');
  return SpreadsheetApp.openById(id);
}

function sheet(name) {
  const sh = ss().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต: ' + name);
  return sh;
}

/** อ่านทั้งชีตเป็น array ของ object */
function readAll(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === '') continue;
    const o = {};
    for (let c = 0; c < head.length; c++) o[head[c]] = values[r][c];
    o.__row = r + 1;
    rows.push(o);
  }
  return rows;
}

function findAll(name, field, value) {
  return readAll(name).filter(function (r) { return String(r[field]) === String(value); });
}

function findOne(name, field, value) {
  return findAll(name, field, value)[0] || null;
}

function appendRow(name, obj) {
  const sh = sheet(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  sh.appendRow(row);
  return obj;
}

/** เขียนหลายแถวรวดเดียว (เร็วกว่า appendRow ทีละแถวมาก) */
function appendRows(name, objs) {
  if (!objs || !objs.length) return 0;
  const sh = sheet(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = objs.map(function (o) {
    return head.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
  return rows.length;
}

function updateRowById(name, idField, idValue, patch) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const head = values[0];
  const idx = head.indexOf(idField);
  if (idx < 0) throw new Error('ไม่พบคอลัมน์ ' + idField + ' ในชีต ' + name);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx]) === String(idValue)) {
      Object.keys(patch).forEach(function (k) {
        const c = head.indexOf(k);
        if (c >= 0) values[r][c] = patch[k];
      });
      sh.getRange(r + 1, 1, 1, head.length).setValues([values[r]]);
      const o = {};
      for (let c = 0; c < head.length; c++) o[head[c]] = values[r][c];
      return o;
    }
  }
  return null;
}

/* ============================================================
   ติดตั้งฐานข้อมูล
   ============================================================ */

/** สร้างสเปรดชีต + ทุกชีต + หัวตาราง + ข้อมูลตั้งต้น (idempotent เรียกซ้ำได้) */
function setupDatabase() {
  let id = cfg('SHEET_ID');
  let book;
  if (id) {
    book = SpreadsheetApp.openById(id);
  } else {
    book = SpreadsheetApp.create('DB — ' + APP.courseCode + ' ' + APP.courseName);
    id = book.getId();
    setConfig('SHEET_ID', id);
  }

  Object.keys(HEADERS).forEach(function (name) {
    let sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    const head = HEADERS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#4361ee').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > head.length) {
      sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
    }
  });

  const first = book.getSheets()[0];
  if (first && HEADERS[first.getName()] === undefined && book.getSheets().length > 1) {
    book.deleteSheet(first);
  }

  seedBadges();
  seedMissions();
  seedLessons();
  seedQuestions();

  const url = book.getUrl();
  Logger.log('SHEET_ID = ' + id);
  Logger.log('Spreadsheet URL = ' + url);
  return { sheetId: id, url: url };
}

function seedBadges() {
  if (readAll(SHEETS.BADGES).length) return 0;
  return appendRows(SHEETS.BADGES, BADGE_SEED.map(function (b) {
    return {
      badge_id: b[0], badge_name: b[1], description: b[2], icon: b[3], color: b[4],
      condition_type: b[5], condition_value: b[6], points: b[7], is_active: true,
    };
  }));
}

function seedMissions() {
  if (readAll(SHEETS.MISSIONS).length) return 0;
  return appendRows(SHEETS.MISSIONS, MISSION_SEED.map(function (m) {
    return {
      mission_id: m[0], mission_name: m[1], description: m[2], icon: m[3],
      condition_type: m[4], condition_value: m[5], points: m[6], is_active: true,
    };
  }));
}

function seedLessons() {
  if (readAll(SHEETS.LESSONS).length) return 0;
  return appendRows(SHEETS.LESSONS, LESSON_SEED.map(function (l, i) {
    return {
      lesson_id: l.id,
      category_id: l.id,
      title: l.title,
      hours: l.hours,
      summary: l.summary,
      objectives: l.objectives.join('\n'),
      content_html: l.html,
      order_no: i + 1,
      is_active: true,
    };
  }));
}

function seedQuestions() {
  if (readAll(SHEETS.QUESTIONS).length) return 0;
  const rows = [];
  Object.keys(QUESTION_SEED).forEach(function (cat) {
    QUESTION_SEED[cat].forEach(function (q, i) {
      rows.push({
        question_id: cat + '-Q' + ('0' + (i + 1)).slice(-2),
        category_id: cat,
        question_text: q.q,
        choice_a: q.c[0],
        choice_b: q.c[1],
        choice_c: q.c[2],
        choice_d: q.c[3],
        correct_answer: ['A', 'B', 'C', 'D'][q.a],
        explanation: q.e,
        order_no: i + 1,
        is_active: true,
      });
    });
  });
  return appendRows(SHEETS.QUESTIONS, rows);
}

/** ลบข้อมูลผู้เรียนทั้งหมด (เก็บคลังข้อสอบ/บทเรียน/เหรียญไว้) — ใช้ตอนเริ่มสอนรอบใหม่ */
function resetLearnerData() {
  [SHEETS.USERS, SHEETS.CHECKINS, SHEETS.QUIZ_RESULTS, SHEETS.QUIZ_ANSWERS,
   SHEETS.USER_BADGES, SHEETS.USER_MISSIONS, SHEETS.POINTS_LOG, SHEETS.LESSON_PROGRESS]
    .forEach(function (name) {
      const sh = sheet(name);
      if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    });
  return 'reset ok';
}
