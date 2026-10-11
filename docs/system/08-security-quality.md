# 08 — Security, Quality Gates และข้อจำกัดของระบบ

[กลับดัชนี](README.md) | [ต่อ: Maintenance Handoff](09-maintenance-handoff.md)

## 1. Trust / Privacy Boundaries

- Public GitHub Pages เป็น Static Site ไม่เก็บ Secrets, Database Password หรือ Podman Socket
- Browser → API ผ่าน HTTPS Funnel และ CORS Allowlist; `credentials: 'omit'`
- CORS **ไม่ใช่ระบบ Login/Authorization**. Public API ออกแบบสำหรับข้อมูล Read-only เชิงสรุปที่เผยแพร่ได้เท่านั้น
- Fastify API และ PostgreSQL คงอยู่ใน Fedora Runtime; DB ไม่มี Public Host Port
- API Host Port ใช้ loopback-only ingress ตาม Infra; ห้าม Publish ไป WAN หรือเปิด Port บน Firewall โดยไม่มี Gate
- ไม่ใส่ Payload คนไข้/ข้อมูลระบุตัวบุคคลใน Public KPI Result หรือ Excel โดยไม่ผ่าน Data Classification/PDPA Review แยกต่างหาก
- External Links จาก Catalog ต้องผ่าน HTTP(S) URL Validation; อย่าปล่อย `javascript:` Scheme

## 2. Safe Data Processing

- Strict Parsing ตรวจ Object, Array, String, Decimal Run ID, Numeric Finite, Period, KPI Keys, Reference Codes
- Prototype-safe Mapping สำหรับ Hospcode/Area Keys ป้องกัน Object prototype-key collision
- ห้ามรวม Results กับ Catalog คนละ Active Run; Feature 031 ตรวจและ Retry bounded
- Malformed API Contract ต้อง Fail Closed และแสดง Error ไม่ใช้ Stale Fallback ที่ทำให้ผู้ใช้เชื่อข้อมูลผิด
- Percent/Target Semantics ต้องแยก Raw Count, Zero Denominator, Explicit Target Zero และ Missing Target
- No-secret, no-internal-URL leak ใน Public Build Boundary: `pa-dashboard-api:3001` และ Legacy Script Endpoint ไม่ควรปรากฏใน Static Export

## 3. Automated Testing

Current CI ตรวจ:
- API parsing/model/active-run snapshots: `test:dashboard`
- KPI raw count/target/summaries: `test:kpi-semantics` + target/type/availability contracts
- URL share/filter/atomic snapshot: `test:url-state` + `dashboard-filter-state-contract.test.mjs`
- Excel filtered export: `test:excel-export`
- Timezone: `dashboard-time.test.ts`
- Accessibility: `accessibility-contract.test.mjs`
- ESLint + Static Export + Public Boundary

Upstream Backend มี separate Unit, SQL Integration, CORS/HTTP, Sync Orchestrator/Calculation, Reference Populate, Deployment Contract tests. **Frontend CI ผ่านไม่ได้แปลว่า Backend PostgreSQL Integration ผ่านใน Deploy ใหม่**; ต้องดู CI/Release Evidence ของ Backend ต่างหาก.

## 4. Dependency Security Baseline (2026-10-11)

- Public `next=16.4.0`, `eslint-config-next=16.4.0`; package/lockfile จาก Security PR #29
- Fedora Integration Test Gate C4.1: **Production `npm audit` 0 Critical / 0 High / 0 Total**; Full audit **0 Critical / 5 High / 5 Total**
- Full-audit Residual คือ Dev-only transitive chain `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- Human Gates C3.10 (Security PR #29) และ C4.6 (Feature PR #28) **ยอมรับความเสี่ยงแบบมีเงื่อนไขเฉพาะแต่ละ Release**, ไม่ใช่ Blanket Waiver หรือคำยืนยันว่าสแกนปลอดภัย 100%
- เงื่อนไข: คง Lockfile/Pins; Review การตั้งค่า `settings.next.rootDir` / Untrusted Glob Patterns; จำกัด CI `permissions: contents: read` ไม่รับ PR Secrets/Deploy ใน CI; ทบทวนทันทีเมื่อ Advisory/Patch Upstream เปลี่ยนหรือ **ไม่เกิน 2026-11-09**; ก่อน Merge ครั้งถัดไปตรวจ SHA/CI/Audit/Scope ใหม่เสมอ
- **อย่ารัน** `npm audit fix --force` หรือ Downgrade Major แบบไม่ผ่าน Dependency Compatibility Tests; แยก Security Remediation PR และ Release Gate

## 5. Tests ไม่ได้พิสูจน์อะไรบ้าง

- `Static Export PASS` ไม่ได้พิสูจน์ API Browser/CORS จริง
- `HTTP 200` ไม่ได้พิสูจน์ React UI แสดง KPI และ Pass Rate จริง
- `KPI_COUNT=47` ไม่ได้พิสูจน์ทุก Target ถูกต้องโดยอัตโนมัติ; ต้องตรวจ Source/Registry และ Semantics
- `Backend Health Ready` ไม่ได้พิสูจน์ว่า Latest Sync ไม่มี Failures หรือ Data Fresh
- `Docs Reviewed` ไม่ได้พิสูจน์ Host State/Backup Scheduler ทำงานจริง
- Browser UAT เป็น Evidence ที่ผู้ใช้ยืนยันจาก Browser; เครื่องมือฝั่ง Code/CI ตรวจแทนไม่ได้ทั้งหมด

## 6. แนวปฏิบัติ Report Incident

บันทึกเวลา, Public Release Commit, Active Run ID, Endpoint, HTTP Status, Error String **ที่ไม่เปิดเผย Secrets**, GitHub Workflow Run URL, Fedora Service/Journald Evidence ตามสิทธิ. ถ้าพบข้อมูลผิด Active Run หรือ Untrusted Public Data ให้หยุดเผยแพร่การเปลี่ยนเพิ่มเติมและใช้ Approved Rollback Plan ที่มี Source/Digest/DB Snapshot พร้อม.

## 7. Public Privacy Review Before Extension

ก่อนเพิ่ม KPI Field/JSON Payload/Excel Column ใหม่ ต้องตรวจว่าเป็น **aggregate ที่เผยแพร่ได้จริง**, ไม่ระบุตัวบุคคล/สุขภาพเฉพาะบุคคล, ไม่รั่ว Host Secrets, และแยกสิทธิการเข้าถึงให้เหมาะสม. หากมีข้อมูลส่วนบุคคล/ความลับ ต้องออกแบบ API/Auth/Privacy ใหม่ ไม่ใช่เพียงซ่อนด้วย React UI.
