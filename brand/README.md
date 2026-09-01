# ชุดภาพสำหรับ LINE Official Account

ภาพทั้งหมดเรนเดอร์จากไฟล์ HTML ในโฟลเดอร์นี้ ใช้ธีมฟ้า-ม่วงเดียวกับเว็บแอป
แก้ข้อความหรือสีได้ที่ไฟล์ `.html` แล้วเรนเดอร์ใหม่ (วิธีอยู่ท้ายไฟล์)

| ไฟล์ | ขนาด | ใช้ที่ไหน |
|---|---|---|
| `line-profile-640.png` | 640×640 | รูปโปรไฟล์ของ LINE OA |
| `line-cover-1080x878.png` | 1080×878 | ภาพหน้าปก (Cover photo) |
| `line-richmenu-2500x1686.jpg` | 2500×1686 · 255 KB | ภาพ Rich Menu |
| `richmenu-areas.json` | — | พิกัดปุ่มสำหรับสร้าง Rich Menu ผ่าน Messaging API |

ข้อกำหนดของ LINE ที่ยึดไว้

- Rich menu: กว้าง 800–2500 px, สูงอย่างน้อย 250 px, สัดส่วนกว้าง/สูง ≥ 1.45, **ไฟล์ไม่เกิน 1 MB**
- รูปโปรไฟล์และหน้าปก: ไม่เกิน 3 MB รองรับ JPG / PNG

## วิธีอัปโหลด

### รูปโปรไฟล์และหน้าปก

LINE Official Account Manager → **ตั้งค่า** → **ข้อมูลบัญชี**

- รูปโปรไฟล์ → อัปโหลด `line-profile-640.png`
- ภาพหน้าปก → อัปโหลด `line-cover-1080x878.png`

> LINE ครอบรูปโปรไฟล์เป็นวงกลม ภาพนี้จึงวางไอคอนกับข้อความไว้กลางภาพทั้งหมด
> ส่วนหน้าปกเว้นพื้นที่ด้านล่าง ~250 px ไว้ เพราะรูปโปรไฟล์และชื่อบัญชีจะทับตรงนั้น

### Rich Menu แบบใช้หน้าจอจัดการ (ง่ายกว่า)

1. LINE Official Account Manager → **ริชเมนู** → **สร้างใหม่**
2. ตั้งชื่อ ช่วงเวลาแสดงผล และข้อความบนแถบแชทเป็น `เมนูการเรียน`
3. เทมเพลต → เลือกแบบ **6 ช่อง (3×2)**
4. อัปโหลด `line-richmenu-2500x1686.jpg`
5. ตั้ง action ของแต่ละช่องเป็น **ลิงก์ (URL)** ตามตารางนี้

| ช่อง | ตำแหน่ง | URL |
|---|---|---|
| เช็คอิน | บนซ้าย | `https://internet-quest.vercel.app/#checkin` |
| บทเรียน | บนกลาง | `https://internet-quest.vercel.app/#lesson` |
| Quiz | บนขวา | `https://internet-quest.vercel.app/#quiz` |
| เหรียญตรา | ล่างซ้าย | `https://internet-quest.vercel.app/#badge` |
| อันดับ | ล่างกลาง | `https://internet-quest.vercel.app/#rank` |
| เข้าเว็บเรียน | ล่างขวา | `https://internet-quest.vercel.app/` |

6. บันทึกและเปิดใช้งาน

> เว็บรองรับ deep link ด้วย hash แล้ว กดปุ่มไหนก็เปิดตรงแท็บนั้นทันที
> ถ้าตั้ง LIFF ไว้ ให้เปลี่ยน URL เป็น `https://liff.line.me/<LIFF_ID>/#quiz`
> จะเข้าสู่ระบบอัตโนมัติในแอป LINE โดยไม่เด้งออกเบราว์เซอร์

### Rich Menu แบบใช้ Messaging API

ใช้ `richmenu-areas.json` ที่เตรียมพิกัดไว้ให้แล้ว (ต้องมี channel access token ของ Messaging API channel)

```bash
TOKEN="<channel access token>"

# 1) สร้างเมนูจากไฟล์พิกัด
RICH_MENU_ID=$(curl -s -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @richmenu-areas.json | python3 -c 'import sys,json;print(json.load(sys.stdin)["richMenuId"])')

# 2) อัปโหลดภาพ
curl -X POST "https://api-data.line.me/v2/bot/richmenu/$RICH_MENU_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @line-richmenu-2500x1686.jpg

# 3) ตั้งเป็นเมนูเริ่มต้นของผู้ใช้ทุกคน
curl -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RICH_MENU_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## เรนเดอร์ภาพใหม่

ต้องมี Node.js และ Playwright

```bash
# เสิร์ฟไฟล์ในโฟลเดอร์นี้
python3 -m http.server 4322

# อีกหน้าต่างหนึ่ง
npx playwright screenshot --viewport-size=640,640   http://localhost:4322/profile.html  line-profile-640.png
npx playwright screenshot --viewport-size=1080,878  http://localhost:4322/cover.html    line-cover-1080x878.png
npx playwright screenshot --viewport-size=2500,1686 http://localhost:4322/richmenu.html richmenu.png

# บีบ Rich Menu ให้ต่ำกว่า 1 MB (macOS)
sips -s format jpeg -s formatOptions 82 richmenu.png --out line-richmenu-2500x1686.jpg
```
