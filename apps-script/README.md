# Internet Quest — ระบบการเรียนรู้เชื่อม LINE OA

ระบบทบทวนบทเรียนและตอบคำถามแบบ Gamification วิชา **21910-2002 อินเทอร์เน็ตในงานธุรกิจดิจิทัล**
(หลักสูตร ปวช. พุทธศักราช 2567 สาขาวิชาเทคโนโลยีธุรกิจดิจิทัล)

- เข้าสู่ระบบด้วยบัญชี LINE (LINE Login + LIFF)
- เก็บข้อมูลผู้เรียนทั้งหมดใน Google Sheets
- Backend: Google Apps Script
- Frontend: HTML5 + CSS3 + Bootstrap 5 + JavaScript ES6 + SweetAlert2 + Font Awesome + Chart.js
- ไม่ใช้เฟรมเวิร์กอื่นนอกเหนือจากนี้

> มีเวอร์ชัน Vercel ที่ใช้ Google Sheet ใบเดียวกันอยู่ที่ `../line-oa-vercel`
> deploy ด้วย `git push` เร็วกว่าและได้โดเมนสั้น ดูรายละเอียดใน README ของโฟลเดอร์นั้น

## ฟีเจอร์

| ส่วน | รายละเอียด |
|---|---|
| โปรไฟล์ | รูปและชื่อจาก LINE, คะแนนสะสม, ระดับผู้เรียน, Progress Bar ไประดับถัดไป |
| ตัวนับ | บทเรียนที่เรียนสำเร็จ, ภารกิจที่สำเร็จ, จำนวน Badge, อันดับของผู้เรียน |
| เช็คอิน | เช็คอินวันละครั้ง มีระบบสตรีค ยิ่งต่อเนื่องยิ่งได้โบนัส + กราฟย้อนหลัง 14 วัน |
| บทเรียน | 6 หน่วยตามคำอธิบายรายวิชา อ่านจบได้แต้ม |
| Quiz | 6 หมวด หมวดละ 10 ข้อ (รวม 60 ข้อ) พร้อมเฉลยและเหตุผลรายข้อหลังส่งคำตอบ |
| Badge | 12 เหรียญ ปลดล็อกจากการเช็คอิน การเรียน และการทำ Quiz |
| ภารกิจ | 8 ภารกิจพร้อมแถบความคืบหน้า |
| อันดับ | โพเดียม 3 อันดับแรก และตารางอันดับคะแนนสูงสุด |

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|---|---|
| `Code.gs` | `doGet` เส้นทางหลัก + ฟังก์ชันติดตั้ง `initProject()` / `showConfig()` |
| `Config.gs` | ค่าตั้งค่า ชื่อชีต หัวตาราง หมวดหมู่ ระดับ แต้ม เหรียญ ภารกิจ |
| `Database.gs` | ชั้นเชื่อมต่อ Google Sheets และ `setupDatabase()` |
| `Auth.gs` | LINE Login OAuth 2.1 และการตรวจ ID Token จาก LIFF |
| `Api.gs` | ฟังก์ชันที่หน้าเว็บเรียกใช้ (เช็คอิน บทเรียน Quiz Badge อันดับ) |
| `QuestionSeed.gs` | คลังข้อสอบ 60 ข้อ |
| `LessonSeed.gs` | เนื้อหาบทเรียน 6 หน่วย |
| `Index.html` | หน้าเว็บหลัก |
| `Styles.html` | ธีมฟ้า-ม่วง |
| `Scripts.html` | ตรรกะฝั่งเบราว์เซอร์ |
| `Setup.html` | หน้าแจ้งเตือนเมื่อยังตั้งค่าไม่ครบ |
| `appsscript.json` | Manifest (timezone, scopes, webapp) |

## ขั้นตอนติดตั้ง

### 1. สร้างโปรเจกต์ Apps Script

1. เปิด <https://script.google.com> แล้วสร้าง New project
2. เปิด Project Settings ติ๊ก **Show "appsscript.json" manifest file in editor**
3. สร้างไฟล์ให้ครบตามตารางข้างบน แล้ววางโค้ดจากโฟลเดอร์นี้ลงไป
   (ไฟล์ `.gs` เลือกชนิด Script, ไฟล์ `.html` เลือกชนิด HTML)

### 2. สร้าง LINE Login channel

1. เปิด <https://developers.line.biz/console/>
2. สร้าง Provider แล้วสร้าง Channel ชนิด **LINE Login**
3. ผูก channel นี้เข้ากับ LINE OA ที่มีอยู่ในแท็บ Basic settings หัวข้อ Linked LINE Official Account
4. จดค่า **Channel ID** และ **Channel secret** ไว้

### 3. ตั้งค่าและสร้างฐานข้อมูล

เปิด `Code.gs` แก้ค่าในฟังก์ชัน `initProject()`

```javascript
setConfig('LINE_CHANNEL_ID', '2001234567');
setConfig('LINE_CHANNEL_SECRET', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
setConfig('LIFF_ID', '');     // ใส่ทีหลังได้
setConfig('WEBAPP_URL', '');  // เว้นว่างได้
```

กด Run ที่ฟังก์ชัน `initProject()` หนึ่งครั้ง (อนุญาตสิทธิ์ตามที่ขอ) ระบบจะ

- สร้าง Google Sheet ใหม่ชื่อ `DB — 21910-2002 อินเทอร์เน็ตในงานธุรกิจดิจิทัล`
- สร้างชีตครบ 12 ชีตพร้อมหัวตาราง
- ใส่ข้อสอบ 60 ข้อ บทเรียน 6 หน่วย เหรียญ 12 ใบ และภารกิจ 8 รายการ
- บันทึก `SHEET_ID` ลง Script Properties ให้อัตโนมัติ

ดู URL ของสเปรดชีตได้ที่ Execution log

### 4. Deploy เป็น Web App

1. Deploy > New deployment > เลือก type เป็น **Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Deploy แล้วคัดลอก **Web app URL** ที่ลงท้ายด้วย `/exec`

### 5. ตั้ง Callback URL

กลับไปที่ LINE Login channel > แท็บ **LINE Login** > **Callback URL**
วาง Web app URL ที่ได้จากขั้นที่ 4 (ต้องตรงกันทุกตัวอักษร)

เปิด Web app URL ในเบราว์เซอร์ ระบบจะพาไปหน้า login ของ LINE ทันที

### 6. (ไม่บังคับ) เพิ่ม LIFF สำหรับเปิดในแอป LINE

1. ใน LINE Login channel > แท็บ **LIFF** > Add
2. Endpoint URL = Web app URL เดียวกัน, Size = Full, เปิด scope `profile` และ `openid`
3. คัดลอก **LIFF ID** มาใส่ด้วย `setConfig('LIFF_ID', '2001234567-xxxxxxxx')` แล้ว Run
4. นำ LIFF URL (`https://liff.line.me/<LIFF_ID>`) ไปใส่ใน Rich Menu ของ LINE OA
   เมื่อผู้เรียนกดจากแอป LINE จะเข้าสู่ระบบได้ทันทีโดยไม่ต้อง redirect

## โครงสร้าง Google Sheets

| ชีต | คอลัมน์ |
|---|---|
| `Users` | user_id, line_user_id, display_name, picture_url, status_message, total_points, level, streak_days, last_checkin_date, session_token, session_expired_at, created_at, last_login |
| `Questions` | question_id, category_id, question_text, choice_a, choice_b, choice_c, choice_d, correct_answer, explanation, order_no, is_active |
| `Lessons` | lesson_id, category_id, title, hours, summary, objectives, content_html, order_no, is_active |
| `LessonProgress` | progress_id, user_id, lesson_id, status, points_awarded, completed_at |
| `CheckIns` | checkin_id, user_id, checkin_date, streak_days, points, created_at |
| `QuizResults` | result_id, user_id, category_id, score, total, percent, passed, points, duration_seconds, created_at |
| `QuizAnswers` | answer_id, result_id, user_id, question_id, selected_answer, correct_answer, is_correct, created_at |
| `Badges` | badge_id, badge_name, description, icon, color, condition_type, condition_value, points, is_active |
| `UserBadges` | user_badge_id, user_id, badge_id, earned_at |
| `Missions` | mission_id, mission_name, description, icon, condition_type, condition_value, points, is_active |
| `UserMissions` | user_mission_id, user_id, mission_id, completed_at |
| `PointsLog` | log_id, user_id, source, detail, points, balance_after, created_at |

## เกณฑ์คะแนนและระดับ

**แต้มที่ได้รับ**

- เช็คอิน 10 แต้ม + โบนัสสตรีค 5 แต้มต่อวันที่ต่อเนื่อง (สูงสุด 50)
- ตอบ Quiz ถูกข้อละ 10 แต้ม, ผ่านเกณฑ์ 60% รับเพิ่ม 20 แต้ม, คะแนนเต็มรับเพิ่ม 50 แต้ม
- เรียนจบบทเรียน 1 หน่วย 30 แต้ม
- ปลดล็อกเหรียญและภารกิจได้แต้มเพิ่มตามที่กำหนดในชีต `Badges` และ `Missions`

**ระดับผู้เรียน**

| ระดับ | ชื่อ | คะแนนสะสม |
|---|---|---|
| 1 | ผู้เริ่มต้นออนไลน์ | 0 |
| 2 | นักท่องเว็บ | 100 |
| 3 | นักสืบค้นข้อมูล | 300 |
| 4 | นักสื่อสารดิจิทัล | 600 |
| 5 | นักการตลาดออนไลน์ | 1,000 |
| 6 | ผู้พิทักษ์ไซเบอร์ | 1,500 |
| 7 | ปรมาจารย์ธุรกิจดิจิทัล | 2,200 |

## การดูแลระบบ

- **แก้ข้อสอบหรือบทเรียน** แก้ที่ชีต `Questions` / `Lessons` ได้โดยตรง ระบบอ่านค่าจากชีตทุกครั้ง
- **เพิ่มข้อสอบ** เพิ่มแถวใหม่ ตั้ง `category_id` เป็น U1–U6 และ `correct_answer` เป็น A/B/C/D
- **เริ่มสอนรอบใหม่** รันฟังก์ชัน `resetLearnerData()` เพื่อล้างข้อมูลผู้เรียนโดยเก็บคลังข้อสอบไว้
- **แก้โค้ดแล้วไม่เห็นผล** ต้อง Deploy > Manage deployments > แก้ไข version เป็น New version ทุกครั้ง

## ข้อควรรู้

- Channel Secret เก็บใน Script Properties ไม่ได้อยู่ในโค้ดที่ส่งไปยังเบราว์เซอร์
- เฉลยข้อสอบไม่ถูกส่งไปยังเบราว์เซอร์ตอนทำข้อสอบ ระบบตรวจที่ฝั่งเซิร์ฟเวอร์แล้วจึงส่งเฉลยกลับมาพร้อมผลสอบ
- session มีอายุ 30 วัน กำหนดที่ `APP.sessionDays`
- ระบบเก็บเฉพาะ LINE user ID ชื่อ และรูปโปรไฟล์ ตามหลักการเก็บข้อมูลเท่าที่จำเป็นของ PDPA
