# Internet Quest — ระบบการเรียนรู้เชื่อม LINE OA

ระบบทบทวนบทเรียนและตอบคำถามแบบ Gamification เข้าสู่ระบบด้วยบัญชี LINE เก็บข้อมูลใน Google Sheets
วิชา **21910-2002 อินเทอร์เน็ตในงานธุรกิจดิจิทัล** (ปวช. 2567 สาขาเทคโนโลยีธุรกิจดิจิทัล)

รีโปนี้มีสองเวอร์ชันที่ทำงานเหมือนกันและ **ใช้ Google Sheet ใบเดียวกันได้**

- **รากของรีโป** — เวอร์ชัน Vercel (serverless + static) คือเว็บที่ deploy จริง
- **`apps-script/`** — เวอร์ชัน Google Apps Script สำหรับส่งเป็นโค้ดประกอบงาน

## ทำไมถึงมีสองเวอร์ชัน

| | Apps Script | Vercel |
|---|---|---|
| Deploy | คัดลอกไฟล์ + New version ทุกครั้ง | `git push` |
| ความเร็ว | 1-3 วินาทีต่อคำขอ | ~200-400 มิลลิวินาที |
| LINE Login | ต้องแก้ปัญหา iframe ด้วย `window.top` | redirect ปกติ |
| URL | `script.google.com/macros/s/AKfy.../exec` | โดเมนสั้นของตัวเอง |
| Local dev | ไม่มี | `vercel dev` |
| ต้องตั้งเพิ่ม | ไม่มี | Service Account + environment variables |

เก็บทั้งสองไว้เพื่อส่งอาจารย์ได้ทั้งลิงก์เว็บและโค้ด Apps Script

## เทคโนโลยี

HTML5 + CSS3 + Bootstrap 5 + JavaScript ES6 + SweetAlert2 + Font Awesome + Chart.js + LINE Login + LIFF
ฝั่งเซิร์ฟเวอร์เป็น Vercel Serverless Function (Node.js 20) **ไม่มี dependency ภายนอกเลย**
เซ็น JWT ของ Service Account เองด้วย `node:crypto` เพื่อให้ cold start เร็ว

## โครงสร้างไฟล์

```
Internet-Quest-Line-OA/
├── api/
│   ├── [action].js          endpoint ของแอปทั้งหมด (1 function)
│   └── auth/[action].js     login / callback / liff / logout (1 function)
├── lib/
│   ├── config.js            ค่าคงที่ หมวดหมู่ ระดับ แต้ม เหรียญ ภารกิจ
│   ├── sheets.js            ไคลเอนต์ Google Sheets API v4 (zero dependency)
│   ├── session.js           cookie เซสชันเซ็นด้วย HMAC-SHA256
│   ├── line.js              LINE Login OAuth 2.1 + ตรวจ ID Token
│   ├── store.js             ตรรกะเช็คอิน บทเรียน Quiz รางวัล อันดับ
│   └── util.js              วันเวลาโซนไทย, JSON response
├── data/
│   ├── questions.js         ข้อสอบ 60 ข้อ (6 หมวด × 10)
│   └── lessons.js           บทเรียน 6 หน่วย
├── public/
│   ├── index.html
│   ├── styles.css           ธีมฟ้า-ม่วง
│   └── app.js
├── apps-script/             เวอร์ชัน Google Apps Script (ไม่เกี่ยวกับการ build ของ Vercel)
├── vercel.json
├── package.json
└── .env.example
```

Vercel นับเป็น **2 serverless functions** เท่านั้น อยู่ในโควตาฟรีสบาย ๆ

## ขั้นตอนติดตั้ง

### 1. เตรียม Google Sheet

ใช้ Sheet ใบเดิมจากเวอร์ชัน Apps Script ได้เลย หรือสร้างใหม่เปล่า ๆ ก็ได้
คัดลอก `SHEET_ID` จาก URL: `docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

### 2. สร้าง Google Service Account

1. เปิด <https://console.cloud.google.com> สร้างโปรเจกต์ใหม่
2. APIs & Services > Library > เปิดใช้ **Google Sheets API**
3. APIs & Services > Credentials > Create credentials > **Service account**
4. เปิด service account ที่สร้าง > แท็บ **Keys** > Add key > Create new key > เลือก **JSON** แล้วดาวน์โหลด
5. คัดลอกอีเมลของ service account (ลงท้าย `@....iam.gserviceaccount.com`)
6. กลับไปที่ Google Sheet กด **Share** แล้วเพิ่มอีเมลนั้นเป็น **Editor**

> ขั้นที่ 6 สำคัญที่สุด ถ้าไม่แชร์ จะขึ้น error ว่าไม่มีสิทธิ์เข้าถึง

### 3. สร้าง LINE Login channel

1. <https://developers.line.biz/console/> > สร้าง Provider > สร้าง Channel ชนิด **LINE Login**
2. แท็บ Basic settings ผูกกับ LINE OA ที่มีอยู่ในหัวข้อ Linked LINE Official Account
3. จด **Channel ID** และ **Channel secret**
4. ยังไม่ต้องใส่ Callback URL ตอนนี้ รอได้โดเมนจาก Vercel ก่อน

### 4. Deploy ขึ้น Vercel

```bash
npx vercel            # deploy preview ครั้งแรก จะถามให้ link project
npx vercel --prod     # deploy production
```

หรือ push ขึ้น GitHub แล้วกด Import project ที่ <https://vercel.com/new>

### 5. ตั้ง Environment Variables

Project Settings > Environment Variables ใส่ครบทุกค่า (ดูรายละเอียดใน `.env.example`)

| ชื่อ | ค่า |
|---|---|
| `LINE_CHANNEL_ID` | Channel ID จากขั้นที่ 3 |
| `LINE_CHANNEL_SECRET` | Channel secret จากขั้นที่ 3 |
| `LIFF_ID` | เว้นว่างก่อนได้ |
| `LINE_MESSAGING_TOKEN` | เว้นว่างได้ ใส่เมื่อต้องการส่งการ์ดแจ้งผลเข้าแชท |
| `LINE_MESSAGING_CHANNEL_SECRET` | เว้นว่างได้ ใส่เมื่อต้องการให้พิมพ์คุยกับบอทได้ |
| `APP_BASE_URL` | โดเมน production เช่น `https://internet-quest.vercel.app` — ตั้ง Type เป็น **Config** ไม่ใช่ Secret |
| `SHEET_ID` | จากขั้นที่ 1 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | เนื้อหาไฟล์ JSON ทั้งก้อนจากขั้นที่ 2 |
| `SESSION_SECRET` | สุ่มด้วย `openssl rand -hex 32` |
| `ADMIN_KEY` | สุ่มอีกค่า ใช้เรียก `/api/setup` |

ใส่เสร็จให้ **Redeploy** หนึ่งครั้งเพื่อให้ค่าใหม่มีผล

### 6. ตั้ง Callback URL ที่ LINE

LINE Login channel > แท็บ **LINE Login** > Callback URL ใส่

```
https://<โดเมนของคุณ>/api/auth/callback
```

ต้องตรงกับ `APP_BASE_URL` ที่ตั้งไว้

### 7. สร้างตารางและข้อมูลตั้งต้น

เรียกครั้งเดียว (เรียกซ้ำได้ ไม่เขียนทับข้อมูลเดิม)

```bash
curl -X POST "https://<โดเมนของคุณ>/api/setup?key=<ADMIN_KEY>"
```

ระบบจะสร้างชีตที่ยังไม่มีครบ 12 ชีต ใส่หัวตาราง แล้วเติมข้อสอบ 60 ข้อ บทเรียน 6 หน่วย เหรียญ 12 ใบ ภารกิจ 8 รายการ
ถ้าใช้ Sheet ใบเดิมจาก Apps Script ที่มีข้อมูลอยู่แล้ว จะข้ามการเติมข้อมูลให้อัตโนมัติ

เปิดโดเมนในเบราว์เซอร์ ระบบจะพาไปหน้า login ของ LINE ทันที

### 8. (ไม่บังคับ) เพิ่ม LIFF สำหรับ Rich Menu

1. LINE Login channel > แท็บ **LIFF** > Add
   Endpoint URL = `APP_BASE_URL`, Size = Full, scope `profile` + `openid`
2. คัดลอก LIFF ID ไปใส่ env `LIFF_ID` แล้ว Redeploy
3. เอา `https://liff.line.me/<LIFF_ID>` ไปใส่ปุ่มใน Rich Menu ของ LINE OA
   เปิดจากแอป LINE จะเข้าสู่ระบบทันทีโดยไม่ต้องเปลี่ยนหน้า

## รันในเครื่อง

```bash
cp .env.example .env.local     # เติมค่าให้ครบ
npx vercel dev
```

ตอนพัฒนาในเครื่อง ให้เพิ่ม `http://localhost:3000/api/auth/callback` เข้าไปใน Callback URL ของ LINE ด้วย
และตั้ง `APP_BASE_URL=http://localhost:3000` ใน `.env.local`

> cookie เซสชันตั้งค่า `Secure` ไว้ ถ้าทดสอบบน `http://localhost` บางเบราว์เซอร์ยังยอมรับ
> แต่ถ้าไม่ยอมให้ใช้ `vercel dev --listen 3000` คู่กับ tunnel ที่เป็น https

## API

| Method | เส้นทาง | ต้อง login | ทำอะไร |
|---|---|---|---|
| GET | `/api/config` | ไม่ | ค่าตั้งต้นของหน้าเว็บ + สถานะ login |
| GET | `/api/auth/login` | ไม่ | พาไปหน้า login ของ LINE |
| GET | `/api/auth/callback` | ไม่ | รับ code เปิดเซสชัน |
| POST | `/api/auth/liff` | ไม่ | เข้าสู่ระบบด้วย ID Token จาก LIFF |
| GET | `/api/auth/logout` | ไม่ | ออกจากระบบ |
| GET | `/api/me` | ใช่ | ข้อมูลแดชบอร์ดทั้งหมด |
| POST | `/api/checkin` | ใช่ | เช็คอินประจำวัน |
| GET/POST | `/api/lessons` | ใช่ | รายการบทเรียน / บันทึกว่าเรียนจบ |
| GET/POST | `/api/quiz` | ใช่ | ดึงข้อสอบ / ส่งคำตอบ |
| GET | `/api/history` | ใช่ | ประวัติการทำ Quiz |
| GET | `/api/leaderboard` | ใช่ | อันดับคะแนน |
| POST | `/api/setup?key=` | ADMIN_KEY | สร้างชีตและข้อมูลตั้งต้น |
| POST | `/api/line/webhook` | ลายเซ็น LINE | รับข้อความจากแชทแล้วตอบกลับ |

## แจ้งเตือนเข้าแชท LINE

ถ้าตั้ง `LINE_MESSAGING_TOKEN` ระบบจะส่ง Flex message เข้าแชทของผู้เรียนรายบุคคลเมื่อ

| เหตุการณ์ | การ์ดที่ส่ง |
|---|---|
| ผูกบัญชีเข้าระบบครั้งแรก | ทักทายพร้อมสรุปสิ่งที่ทำได้ |
| เช็คอินสำเร็จ | แต้มที่ได้ สตรีค คะแนนสะสม ระดับปัจจุบัน |
| ส่งแบบทดสอบ | คะแนน ผ่านหรือไม่ผ่าน แต้มที่ได้ |
| ได้รับเหรียญตราใหม่ | รายชื่อเหรียญที่เพิ่งปลดล็อก |

เงื่อนไขที่ต้องครบ

1. ผู้เรียนต้อง **เป็นเพื่อนกับ LINE OA** ก่อน ไม่งั้น LINE ตอบ 403
2. LINE Login channel กับ OA ต้องอยู่ **provider เดียวกัน** ไม่งั้น `userId` คนละชุด ส่งไม่ถึง

วิธีเอา token: LINE Developers Console → Messaging API channel → แท็บ **Messaging API**
→ หัวข้อ **Channel access token (long-lived)** → กด Issue → คัดลอกไปใส่ env แล้ว Redeploy

### พิมพ์คุยกับบอทในแชท

ตั้ง `LINE_MESSAGING_CHANNEL_SECRET` เพิ่ม แล้วตั้ง Webhook URL ที่
LINE Developers Console → Messaging API channel → **Webhook URL**

```
https://internet-quest.vercel.app/api/line/webhook
```

เปิดสวิตช์ **Use webhook** ด้วย จากนั้นผู้เรียนพิมพ์คำเหล่านี้ได้

| พิมพ์ | ได้อะไร |
|---|---|
| `อันดับ` | กระดานอันดับแบบการ์ดเลื่อนซ้ายขวา เห็นรูป ชื่อ ระดับ แต้ม ของแต่ละคน |
| `แต้ม` | การ์ดสรุปคะแนน อันดับ สตรีค บทเรียนที่จบ เหรียญของตัวเอง |
| `เช็คอิน` / `ควิซ` / `บทเรียน` | ลิงก์เข้าหน้านั้นโดยตรง |
| `ช่วย` | รายการคำสั่งทั้งหมด |

การตอบกลับใช้ **reply token** ซึ่ง **ไม่นับรวมในโควตาข้อความรายเดือน** ต่างจาก push
ระบบตรวจลายเซ็น `X-Line-Signature` ทุกคำขอ ปฏิเสธคำขอปลอมด้วยสถานะ 403

> ทุกข้อความที่ระบบส่งเองแบบ push นับรวมในโควตาข้อความรายเดือนของแผน LINE OA ที่ใช้อยู่
> ระบบจึงส่งเฉพาะเหตุการณ์สำคัญ ไม่ส่งทุกครั้งที่เข้าเว็บ
> ถ้าไม่ตั้ง token ระบบจะข้ามการส่งเงียบ ๆ ส่วนอื่นทำงานปกติ

## ความปลอดภัย

- Channel secret และ private key ของ service account อยู่ใน environment variables ไม่ถูกส่งไปยังเบราว์เซอร์
- เซสชันเป็น cookie แบบ `HttpOnly` `Secure` `SameSite=Lax` เซ็นด้วย HMAC-SHA256 แก้ไขค่าไม่ได้
- ป้องกัน CSRF ตอน login ด้วย `state` ที่เก็บใน cookie แล้วตรวจตอน callback
- เฉลยข้อสอบไม่ถูกส่งไปเบราว์เซอร์ตอนทำข้อสอบ ระบบตรวจที่ฝั่งเซิร์ฟเวอร์แล้วจึงส่งเฉลยกลับมาพร้อมผล
- เก็บเฉพาะ LINE user ID ชื่อ และรูปโปรไฟล์ ตามหลักเก็บเท่าที่จำเป็นของ PDPA

## ข้อจำกัดที่ควรรู้

- **ไม่มี lock แบบ Apps Script** ถ้าผู้เรียนกดเช็คอินรัว ๆ พร้อมกันในเสี้ยววินาทีเดียวกัน มีโอกาสได้แต้มซ้ำ
  ระบบกันด้วยการตรวจรายการของวันนี้ก่อนเขียน ซึ่งเพียงพอสำหรับการใช้ในชั้นเรียน
- Google Sheets API มีโควตา 300 คำขออ่านต่อนาทีต่อโปรเจกต์ ห้องเรียนปกติไม่ถึง
- ทุกคำขออ่านทั้งชีต เหมาะกับผู้เรียนหลักสิบถึงหลักร้อย ถ้าเกินนี้ควรย้ายไปฐานข้อมูลจริง

## การดูแล

- แก้ข้อสอบหรือบทเรียนได้ที่ Google Sheet โดยตรง ระบบอ่านค่าจากชีตทุกครั้ง
- เพิ่มข้อสอบ: เพิ่มแถวในชีต `Questions` ตั้ง `category_id` เป็น U1-U6 และ `correct_answer` เป็น A/B/C/D
- เริ่มสอนรอบใหม่: ลบแถวข้อมูลผู้เรียนในชีต `Users`, `CheckIns`, `QuizResults`, `QuizAnswers`,
  `UserBadges`, `UserMissions`, `PointsLog`, `LessonProgress` (เก็บแถวหัวตารางไว้)
