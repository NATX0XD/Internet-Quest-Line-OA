/**
 * Config.gs
 * ระบบการเรียนรู้ 21910-2002 อินเทอร์เน็ตในงานธุรกิจดิจิทัล
 * Google Apps Script + Google Sheets + LINE Login / LIFF
 *
 * ค่าที่ต้องตั้งก่อนใช้งาน จะอ่านจาก Script Properties เป็นหลัก
 * (ไฟล์ > การตั้งค่าโครงการ > คุณสมบัติของสคริปต์)
 * ถ้ายังไม่ตั้ง จะ fallback มาใช้ค่าคงที่ด้านล่างนี้
 */

const DEFAULTS = {
  SHEET_ID: '',            // รหัสสเปรดชีต (เว้นว่าง = สร้างใหม่อัตโนมัติตอน setupDatabase)
  LINE_CHANNEL_ID: '',     // Channel ID ของ LINE Login channel
  LINE_CHANNEL_SECRET: '', // Channel Secret ของ LINE Login channel
  LIFF_ID: '',             // LIFF ID (ถ้ามี ใช้เปิดในแอป LINE)
  WEBAPP_URL: '',          // URL /exec ของ Web App (ต้องตรงกับ Callback URL ใน LINE)
};

function props_() {
  return PropertiesService.getScriptProperties();
}

function cfg(key) {
  const v = props_().getProperty(key);
  return v && String(v).trim() ? String(v).trim() : (DEFAULTS[key] || '');
}

function setConfig(key, value) {
  props_().setProperty(key, String(value));
  return cfg(key);
}

const APP = {
  title: 'Internet Quest — อินเทอร์เน็ตในงานธุรกิจดิจิทัล',
  courseCode: '21910-2002',
  courseName: 'อินเทอร์เน็ตในงานธุรกิจดิจิทัล',
  passPercent: 60,
  sessionDays: 30,
};

const SHEETS = {
  USERS: 'Users',
  QUESTIONS: 'Questions',
  LESSONS: 'Lessons',
  LESSON_PROGRESS: 'LessonProgress',
  CHECKINS: 'CheckIns',
  QUIZ_RESULTS: 'QuizResults',
  QUIZ_ANSWERS: 'QuizAnswers',
  BADGES: 'Badges',
  USER_BADGES: 'UserBadges',
  MISSIONS: 'Missions',
  USER_MISSIONS: 'UserMissions',
  POINTS_LOG: 'PointsLog',
};

const HEADERS = {
  Users: [
    'user_id', 'line_user_id', 'display_name', 'picture_url', 'status_message',
    'total_points', 'level', 'streak_days', 'last_checkin_date',
    'session_token', 'session_expired_at', 'created_at', 'last_login',
  ],
  Questions: [
    'question_id', 'category_id', 'question_text',
    'choice_a', 'choice_b', 'choice_c', 'choice_d',
    'correct_answer', 'explanation', 'order_no', 'is_active',
  ],
  Lessons: [
    'lesson_id', 'category_id', 'title', 'hours', 'summary',
    'objectives', 'content_html', 'order_no', 'is_active',
  ],
  LessonProgress: [
    'progress_id', 'user_id', 'lesson_id', 'status', 'points_awarded', 'completed_at',
  ],
  CheckIns: [
    'checkin_id', 'user_id', 'checkin_date', 'streak_days', 'points', 'created_at',
  ],
  QuizResults: [
    'result_id', 'user_id', 'category_id', 'score', 'total', 'percent',
    'passed', 'points', 'duration_seconds', 'created_at',
  ],
  QuizAnswers: [
    'answer_id', 'result_id', 'user_id', 'question_id',
    'selected_answer', 'correct_answer', 'is_correct', 'created_at',
  ],
  Badges: [
    'badge_id', 'badge_name', 'description', 'icon', 'color',
    'condition_type', 'condition_value', 'points', 'is_active',
  ],
  UserBadges: [
    'user_badge_id', 'user_id', 'badge_id', 'earned_at',
  ],
  Missions: [
    'mission_id', 'mission_name', 'description', 'icon',
    'condition_type', 'condition_value', 'points', 'is_active',
  ],
  UserMissions: [
    'user_mission_id', 'user_id', 'mission_id', 'completed_at',
  ],
  PointsLog: [
    'log_id', 'user_id', 'source', 'detail', 'points', 'balance_after', 'created_at',
  ],
};

/** หมวดหมู่ = 6 หน่วยการเรียนของรายวิชา */
const CATEGORIES = [
  { id: 'U1', name: 'ความรู้เบื้องต้นเกี่ยวกับอินเทอร์เน็ต', icon: 'fa-globe', color: '#4361ee', hours: 3 },
  { id: 'U2', name: 'การใช้งานเว็บเบราว์เซอร์', icon: 'fa-window-maximize', color: '#4895ef', hours: 6 },
  { id: 'U3', name: 'การสืบค้นข้อมูลบนอินเทอร์เน็ต', icon: 'fa-magnifying-glass', color: '#7209b7', hours: 6 },
  { id: 'U4', name: 'อีเมลและธุรกรรมออนไลน์', icon: 'fa-envelope', color: '#560bad', hours: 6 },
  { id: 'U5', name: 'สื่อสังคมออนไลน์เพื่อธุรกิจ', icon: 'fa-hashtag', color: '#b5179e', hours: 6 },
  { id: 'U6', name: 'ความปลอดภัยในการใช้อินเทอร์เน็ต', icon: 'fa-shield-halved', color: '#3a0ca3', hours: 6 },
];

/** ระดับผู้เรียน — ใช้คะแนนสะสมเป็นเกณฑ์ */
const LEVELS = [
  { level: 1, name: 'ผู้เริ่มต้นออนไลน์', min: 0, icon: 'fa-seedling' },
  { level: 2, name: 'นักท่องเว็บ', min: 100, icon: 'fa-compass' },
  { level: 3, name: 'นักสืบค้นข้อมูล', min: 300, icon: 'fa-magnifying-glass-chart' },
  { level: 4, name: 'นักสื่อสารดิจิทัล', min: 600, icon: 'fa-tower-broadcast' },
  { level: 5, name: 'นักการตลาดออนไลน์', min: 1000, icon: 'fa-bullhorn' },
  { level: 6, name: 'ผู้พิทักษ์ไซเบอร์', min: 1500, icon: 'fa-shield-halved' },
  { level: 7, name: 'ปรมาจารย์ธุรกิจดิจิทัล', min: 2200, icon: 'fa-crown' },
];

/** แต้มที่ได้รับจากกิจกรรมต่าง ๆ */
const POINTS = {
  CHECKIN_BASE: 10,
  CHECKIN_STREAK_BONUS: 5,   // ต่อวันที่ต่อเนื่อง สูงสุด CHECKIN_STREAK_MAX
  CHECKIN_STREAK_MAX: 50,
  QUIZ_PER_CORRECT: 10,
  QUIZ_PASS_BONUS: 20,
  QUIZ_PERFECT_BONUS: 50,
  LESSON_COMPLETE: 30,
};

const BADGE_SEED = [
  ['B01', 'ก้าวแรก', 'เช็คอินครั้งแรกในระบบ', 'fa-shoe-prints', '#4361ee', 'checkin_total', 1, 10],
  ['B02', 'ขยันสามวัน', 'เช็คอินต่อเนื่อง 3 วัน', 'fa-fire', '#f72585', 'streak', 3, 30],
  ['B03', 'วินัยเหล็ก', 'เช็คอินต่อเนื่อง 7 วัน', 'fa-fire-flame-curved', '#e63946', 'streak', 7, 70],
  ['B04', 'ขาประจำ', 'เช็คอินสะสมครบ 15 วัน', 'fa-calendar-check', '#4895ef', 'checkin_total', 15, 60],
  ['B05', 'นักลองข้อสอบ', 'ทำ Quiz สำเร็จครั้งแรก', 'fa-pen-to-square', '#7209b7', 'quiz_total', 1, 10],
  ['B06', 'ผ่านฉลุย', 'สอบผ่าน (60%) อย่างน้อย 1 หมวด', 'fa-circle-check', '#2a9d8f', 'quiz_passed', 1, 20],
  ['B07', 'เต็มสิบ', 'ทำ Quiz ได้คะแนนเต็มอย่างน้อย 1 ครั้ง', 'fa-star', '#ffb703', 'perfect', 1, 50],
  ['B08', 'ครบทุกหมวด', 'ทำ Quiz ผ่านครบทั้ง 6 หมวด', 'fa-layer-group', '#560bad', 'quiz_passed_distinct', 6, 100],
  ['B09', 'นักสะสม 500', 'มีคะแนนสะสมครบ 500 แต้ม', 'fa-gem', '#b5179e', 'points', 500, 0],
  ['B10', 'นักสะสม 1000', 'มีคะแนนสะสมครบ 1,000 แต้ม', 'fa-trophy', '#ffd60a', 'points', 1000, 0],
  ['B11', 'นักอ่านตัวยง', 'เรียนบทเรียนครบทั้ง 6 หน่วย', 'fa-book-open-reader', '#3a0ca3', 'lesson_done', 6, 80],
  ['B12', 'จอมเก๋า', 'ทำ Quiz สะสมครบ 12 ครั้ง', 'fa-dumbbell', '#4cc9f0', 'quiz_total', 12, 60],
];

const MISSION_SEED = [
  ['M01', 'เริ่มต้นการเดินทาง', 'เช็คอินเข้าระบบครั้งแรก', 'fa-flag', 'checkin_total', 1, 10],
  ['M02', 'อ่านก่อนสอบ', 'เปิดเรียนบทเรียนอย่างน้อย 1 หน่วย', 'fa-book', 'lesson_done', 1, 15],
  ['M03', 'ลองสนามจริง', 'ทำ Quiz อย่างน้อย 1 หมวด', 'fa-clipboard-question', 'quiz_total', 1, 15],
  ['M04', 'สอบผ่าน 3 หมวด', 'ทำ Quiz ผ่านเกณฑ์ 3 หมวดที่แตกต่างกัน', 'fa-list-check', 'quiz_passed_distinct', 3, 50],
  ['M05', 'ครบทุกหน่วย', 'เรียนบทเรียนครบทั้ง 6 หน่วย', 'fa-graduation-cap', 'lesson_done', 6, 60],
  ['M06', 'สายวินัย', 'เช็คอินต่อเนื่อง 5 วัน', 'fa-calendar-days', 'streak', 5, 40],
  ['M07', 'ล่าคะแนน 1000', 'สะสมคะแนนให้ครบ 1,000 แต้ม', 'fa-coins', 'points', 1000, 100],
  ['M08', 'ไร้ที่ติ', 'ทำ Quiz ได้คะแนนเต็มอย่างน้อย 1 ครั้ง', 'fa-medal', 'perfect', 1, 50],
];
