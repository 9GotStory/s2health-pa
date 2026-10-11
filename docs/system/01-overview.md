# 01 — ภาพรวมระบบและขอบเขต

[กลับดัชนี](README.md) | [ต่อ: Architecture](02-architecture.md)

## 1. ระบบคืออะไร

**S2Health PA Dashboard** คือระบบติดตามตัวชี้วัดผลงาน (PA/KPI) ของเครือข่ายสุขภาพอำเภอสอง จังหวัดแพร่ นำข้อมูลจากแหล่ง MOPH มาจัดเก็บและประมวลผลใน Backend-v2 ก่อนแสดงภาพรวม การผ่านเกณฑ์ รายหน่วยบริการ และรายละเอียด KPI ให้ผู้ใช้งานสาธารณะผ่านหน้าเว็บ

หน้าเว็บสาธารณะ: https://9gotstory.github.io/s2health-pa/

เป้าหมายหลัก:
1. ให้เห็นตัวชี้วัดทั้งหมดและสถานะการประเมินอย่างรวดเร็ว
2. เจาะจากระดับอำเภอไปหน่วยบริการ/ตัวชี้วัดได้โดยไม่คำนวณข้อมูลจริงซ้ำที่ Client
3. ตรวจสอบที่มาของ Dataset ที่เผยแพร่ ป้องกันการผสมผลจาก Sync คนละรอบ
4. เผยแพร่เฉพาะข้อมูลเชิงสรุปผ่าน Public Read API โดยแยก Database/Sync/Secrets ไว้ภายใน
5. คงกระบวนการทดสอบ-รีวิว-อนุมัติ ก่อน Merge/Deploy และย้อนกลับสู่ Baseline ที่ตรวจสอบได้

## 2. ผู้ใช้และผู้ดูแล

| กลุ่ม | สิ่งที่ทำในระบบ |
| --- | --- |
| ผู้บริหาร/เจ้าหน้าที่เครือข่าย | ดูสรุป KPI และสัดส่วนผ่านเกณฑ์ |
| เจ้าหน้าที่หน่วยบริการ | กรองหน่วยบริการ ดูผลรายตัวชี้วัดและข้อมูลแยกหน่วย |
| ผู้ติดตามข้อมูล | เลือกกลุ่ม KPI, เปิดรายละเอียด, เปิดลิงก์รายงานต้นทาง, ส่งออก Excel |
| เจ้าหน้าที่ IT/ผู้ดูแล | ดู CI, Public API, Sync, ตรวจคุณภาพ/ความพร้อม, จัดการ Release ผ่าน GitHub และ Fedora |
| AI Developer/Reviewer | อ้างอิง Source SHA, API Contract, Test, Architecture Boundary และ Change Gate |

**ไม่ได้** เป็นระบบบันทึกเวชระเบียนหรือแก้ไขข้อมูลรายบุคคลผ่านหน้า Public Dashboard และไม่มีหน้าบริหาร Sync สำหรับบุคคลทั่วไปใน Public Edition

## 3. สอง Repository / สองหน้าที่

**Public: `9GotStory/s2health-pa`**
- Next.js 16.4.0, React 19.2.3, TypeScript, Tailwind CSS 4, Lucide Icons
- สร้างเป็นไฟล์ HTML/JS/CSS (`output: 'export'`); GitHub Pages เสิร์ฟไฟล์เหล่านี้
- เรียก Public API ด้วย Browser ผ่าน HTTPS/CORS; ไม่มีการเชื่อม PostgreSQL จาก Browser
- มีหน้าหลักเพียง `src/app/page.tsx` ซึ่งเป็น Dashboard

**Upstream / Private Platform: `9GotStory/pa-dashboard`**
- Frontend ที่เป็นต้นฉบับพฤติกรรมร่วม; Backend-v2 (Node.js 24, Fastify 5, TypeScript)
- PostgreSQL 18; กระบวนการ Sync MOPH, registry/config KPI, lookup/reference, คำนวณ/activate Dataset
- Fedora rootless Podman + systemd Quadlet, SELinux; การดำเนินการผ่านเจ้าของ Production ตามสิทธิ
- มีส่วนภายใน เช่น `src/app/sync/` และ Legacy GAS source; **ไม่ถูกนำมารันใน Public Edition**

## 4. ค่าที่ตรวจยืนยันล่าสุด

**ณ 11 ตุลาคม 2569**: Frontend Release `7c617d20b573899613535168ad70bc835f342cc8` ผ่าน CI และ GitHub Pages Deploy; ทดสอบ HTTP 200 ทั้งหน้าเว็บ, JS, CSS, 4 API; CORS ผ่าน; Active Run `1` ตรงกันระหว่าง Dashboard/KPI Catalog; 47 KPI, 2,995 Results, 17 Facilities, 8 Tambons; Browser UAT ผ่านการโหลด การแสดงสรุป/ตาราง และไม่มีข้อความโหลดข้อมูลล้มเหลว

ค่าเหล่านี้คือ **snapshot ในวันทดสอบ** ไม่ใช่ค่าคงที่หรือ SLA. Production Backend ไม่ได้เปลี่ยนระหว่าง Feature 031 Public Release.

## 5. สิ่งที่อยู่/ไม่อยู่ใน Scope

| อยู่ใน Public Edition | ไม่อยู่ใน Public Edition |
| --- | --- |
| Dashboard, summary cards, category tabs | หน้าภายใน `/sync` |
| Filter สถานบริการ/KPI และ URL shareable state | การอัปโหลด/แก้ไขผล KPI ผ่าน Public UI |
| ตาราง Desktop, การ์ด Mobile, modal รายละเอียด | Backend SQL/migration job บน GitHub Pages |
| แสดงเป้า ตัวตั้ง/ตัวหาร % หรือจำนวน | ข้อมูลผู้ป่วยรายบุคคลใน Public API |
| ส่งออก Excel, ลิงก์แหล่งข้อมูล | GAS/Google Sheets เป็น data path หลัก |
| API validation + active run consistency | Public Database Port / Podman socket |

ดู [04-features.md](04-features.md) สำหรับรายการ Feature และ [08-security-quality.md](08-security-quality.md) สำหรับขอบเขต Security/สิทธิ.
