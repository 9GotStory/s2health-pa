# คู่มือระบบ S2Health PA — ดัชนีเอกสาร

> สถานะ: Documentation baseline / 11 ตุลาคม 2569 (2026-10-11)  
> Public source authority: [9GotStory/s2health-pa](https://github.com/9GotStory/s2health-pa) `main@7c617d20b573899613535168ad70bc835f342cc8`  
> Backend/upstream source authority: [9GotStory/pa-dashboard](https://github.com/9GotStory/pa-dashboard) `develop@a3862692c7ffd8dda3c593fd029e1bb67b7fd68b`  
> Production figures below are **observations at acceptance**, not hardcoded limits or continuously updated metrics.

## เริ่มอ่านจากที่ไหน

| ลำดับ | เอกสาร | เนื้อหา |
| --- | --- | --- |
| 01 | [ภาพรวมและขอบเขตระบบ](01-overview.md) | ระบบคืออะไร ใครใช้ อะไรอยู่ Public/Private และสถานะที่ยืนยัน |
| 02 | [สถาปัตยกรรมและการไหลของข้อมูล](02-architecture.md) | GitHub Pages → HTTPS Funnel → Fastify → PostgreSQL → MOPH |
| 03 | [โครงสร้าง Repository และหน้าที่ไฟล์](03-repository-map.md) | แผนผังไฟล์ Frontend, Backend, Infra และ Tests |
| 04 | [ฟีเจอร์ทั้งหมดและพฤติกรรมหน้าจอ](04-features.md) | สรุป/ตาราง/มือถือ/ฟิลเตอร์/รายละเอียด/Export/Accessibility |
| 05 | [ทะเบียน KPI และชุดตัวชี้วัด](05-kpi-catalog.md) | 52 definitions, 47 public KPIs, 5 source-only พร้อมรายการตาม seed |
| 06 | [Data Model, API และสัญญาข้อมูล](06-data-and-api.md) | Schema, active run, response, validation, consistency, CORS |
| 07 | [Build, Deploy และปฏิบัติการ](07-deployment-operations.md) | CI, GitHub Pages, Podman/Quadlet, sync, backup/recovery และ runbook |
| 08 | [Security, Testing และ Acceptance](08-security-quality.md) | Trust boundary, audits, test suites, release gates และข้อจำกัด |
| 09 | [คู่มือพัฒนาต่อและส่งมอบให้ AI](09-maintenance-handoff.md) | Change workflow, upstream sync, สิ่งที่ห้ามทำ, checklist, troubleshooting |

## ขอบเขตที่ต้องไม่สับสน

- `s2health-pa` = **หน้า Dashboard สาธารณะ**, สร้าง Static Export ด้วย Next.js และเผยแพร่บน GitHub Pages; ไม่มี Node/Database runtime บน Pages
- `pa-dashboard` = **Upstream shared frontend + Backend-v2 + PostgreSQL integration + deployment infrastructure** ซึ่งมี Repository และวงจรเผยแพร่แยกต่างหาก
- ข้อมูลจริงและสูตรคำนวณ KPI เป็นความรับผิดชอบของ Backend; Frontend มีหน้าที่ตรวจสัญญาข้อมูล จัดกลุ่ม คำนวณตัวเลขรวมเพื่อการแสดงผล และจัด UI
- `/sync` เป็นหน้าภายในของ Upstream ไม่ใช่ Route ของ Public GitHub Pages; Public Dashboard อยู่ที่ `/s2health-pa/` **ไม่ใช่** `/s2health-pa/dashboard/`

## หลักฐานล่าสุดในเอกสารชุดนี้

- [Public Feature 031 PR #28](https://github.com/9GotStory/s2health-pa/pull/28) — merged
- [Public Security PR #29](https://github.com/9GotStory/s2health-pa/pull/29) — merged
- [Upstream Issue #102](https://github.com/9GotStory/pa-dashboard/issues/102) — completed
- [CI #38113542848](https://github.com/9GotStory/s2health-pa/actions/runs/38113542848) — SUCCESS
- [GitHub Pages #38113542878](https://github.com/9GotStory/s2health-pa/actions/runs/38113542878) — SUCCESS
- User-verified Fedora external smoke + Browser Functional UAT: PASS (2026-10-11)
- Latest accepted sample: active sync run `1`, 47 KPI, 2,995 result rows, 17 facilities, 8 tambons

## วิธีรักษาเอกสารให้เป็นปัจจุบัน

เมื่อเปลี่ยน Feature, API, Registry, Runtime หรือ Workflow ให้แก้ **ไฟล์หัวข้อที่เกี่ยวข้องและดัชนีนี้ใน PR เดียวกัน** โดยบันทึก Source SHA, วันตรวจจริง และ Acceptance ใหม่ ห้ามถือว่าค่าตัวอย่างด้านบนคงที่ตลอดไป

เอกสารนี้เป็น **คำอธิบายการทำงาน (descriptive)** ไม่ใช่คำสั่งให้เปลี่ยน Production และไม่แทน Unit/Integration/Live Gates; หากข้อความขัดกับ Code ให้ยึด **Code + Contract Tests + Approved GitHub PR** ก่อนและปรับเอกสารตาม.
