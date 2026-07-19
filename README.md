# GHG Scope 3: Employee Commuting Dashboard

เว็บไซต์ Dashboard แบบ Static HTML/CSS/JavaScript สำหรับแสดงข้อมูล GHG Scope 3 — Category 7: Employee Commuting พร้อม Deploy บน Vercel ได้ทันที

## คุณสมบัติ

- KPI: Adjusted GHG, GHG จากแบบสอบถาม, จำนวนผู้ตอบ, ระยะทางเฉลี่ย, GHG เฉลี่ยต่อคน
- กรองตามสถานที่ทำงาน ฝ่ายงาน รูปแบบการเดินทาง เชื้อเพลิง และ Car Pool
- กราฟรูปแบบการเดินทาง เชื้อเพลิง สถานที่ ยานพาหนะ ระยะทาง และฝ่ายงาน
- Management Insights อัตโนมัติตามข้อมูลที่กรอง
- ส่งออกสรุป CSV และ Print/PDF
- Dark mode / Responsive รองรับมือถือ
- ไม่รวมชื่อ อีเมล สังกัดละเอียด หรือชั้น/อาคารในไฟล์ที่ Deploy

## Deploy บน Vercel

### วิธีที่ง่ายที่สุด: Vercel Drop

1. แตกไฟล์ ZIP นี้
2. เข้า Vercel Drop
3. ลากโฟลเดอร์โปรเจกต์หรือไฟล์ ZIP ไปวาง
4. รอระบบ Deploy และรับ URL

### วิธีผ่าน GitHub

1. สร้าง Repository และ Upload ไฟล์ทั้งหมดในโฟลเดอร์นี้
2. ที่ Vercel เลือก **Add New → Project**
3. Import Repository
4. Framework Preset เลือก **Other**
5. ไม่ต้องใส่ Build Command และ Output Directory
6. กด Deploy

## ทดสอบบนเครื่อง

เนื่องจากเว็บไซต์ใช้ `fetch()` อ่าน JSON ควรเปิดผ่าน local web server ไม่ควรดับเบิลคลิก `index.html` โดยตรง

```bash
python -m http.server 8080
```

แล้วเปิด `http://localhost:8080`

## การอัปเดตข้อมูล

ไฟล์ที่ Dashboard อ่านคือ `data/commuting.json` ซึ่งผ่านการลบข้อมูลส่วนบุคคลแล้ว หากต้องการใช้ CSV ชุดใหม่ ให้ปรับสคริปต์แปลงข้อมูลหรือสร้าง JSON ด้วยโครงสร้างเดิม

## Data Quality

- Main KPI ใช้ `ADJ.(SCALE UP) GHG (TonCO2e)` จากไฟล์ต้นทาง
- เดินเท้าแสดงเป็น 0 tCO2e ใน Dashboard
- BTS/MRT จำนวน 73 รายการไม่มี EF/GHG ในไฟล์ต้นทาง จึงไม่รวมในยอด GHG จนกว่าจะกำหนด emission factor
