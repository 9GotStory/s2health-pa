# 09 — Maintenance, Future Development และ AI Handoff

[กลับดัชนี](README.md) | [ภาพรวม](01-overview.md)

## 1. Source of Truth

- **Public repo**: [9GotStory/s2health-pa](https://github.com/9GotStory/s2health-pa), accepted release `main@7c617d20b573899613535168ad70bc835f342cc8`
- **Shared frontend + Backend-v2 source**: [9GotStory/pa-dashboard](https://github.com/9GotStory/pa-dashboard), accepted upstream `develop@a3862692c7ffd8dda3c593fd029e1bb67b7fd68b`
- **Public porting policy**: [docs/frontend-upstream.md](../frontend-upstream.md)
- **Data/API truth**: `backend/src/modules/read-api.ts`, `backend/src/sync/calculation.ts`, `src/lib/dashboard-data.ts`, their tests and live accepted contract evidence
- **Previous acceptance**: [Public PR #28](https://github.com/9GotStory/s2health-pa/pull/28), [Security PR #29](https://github.com/9GotStory/s2health-pa/pull/29), [Feature Issue #102](https://github.com/9GotStory/pa-dashboard/issues/102)

SHA ทั้งหมดเป็น **historical accepted snapshot** ไม่ใช่การยืนยันว่าตรงกับ HEAD ใหม่ในอนาคต: Fetch/Verify ทั้งสอง Repo ก่อนแก้.

## 2. Recommended Development Workflow

**เมื่อแก้ Feature ของ Dashboard ร่วมกัน**
1. ตรวจ `pa-dashboard/develop` และ Test ที่เกี่ยวข้อง; ระบุ Change Impact และ Approval Gate
2. Implement/Review/Test Shared Change ใน Upstream ก่อน แล้ว Merge Upstream ที่อนุมัติ
3. Port มา Public เฉพาะ File ที่จำเป็น; เก็บ `next.config.ts`, `useKPIData.ts`, `layout.tsx`, `pages.yml` และ Public Branding ตาม Policy
4. เทียบ Exact Source SHA, Diff, Regression Tests, API Schema, Security Audit, Export Boundary
5. ตรวจ Actual Live Public API Origin ก่อนเปลี่ยน Frontend Contract
6. ขอ Human Approval สำหรับ Merge Public `main` และ GitHub Pages Auto-Deploy (เป็นเหตุการณ์ที่แยกไม่ขาด)
7. หลัง Merge ตรวจ Exact SHA/CI/Pages, HTTP HTML/JS/CSS, Public GET+JSON+CORS+Active Run, Browser UAT
8. Record PR/Issue Evidence และปรับ Docs ก่อนปิดงาน

**Public-only change**: เปลี่ยน Branding/Static UI ได้ใน Public Branch โดยไม่ Port Infra/Sync. แต่ถ้ามีผลต่อ Shared KPI Semantics ต้องย้อนกลับมาตรวจ Upstream.

**Backend change**: ใช้ Migration, SQL Integration, Sync/Calculation Tests, Host Runtime Approval และ Rollback/Restore Plan แยก. PR Frontend ไม่อนุญาตให้แก้ DB/Host/Production API โดยปริยาย.

## 3. Adding or Changing KPI

- ออกแบบ `kpi_key`, Title, Category/Subgroup/Order, Physical/Virtual Mapping, Source ID, Target, Quarter/Target Months ใน Registry
- แก้ Config/Migration/Backend Calculation และ Regression Fixture โดยไม่ฝังรายชื่อ KPI 47 ตัวคงที่ใน React
- Test กรณี `targetValue: 0`, `null`, Raw-count, Zero Denominator, Unregistered Facility/Areacode, Year/Quarter
- ทดสอบ Sync แบบแยก Production และ Atomic Active Run Before/After
- ยืนยัน `/api/v1/kpis` มี activeSyncRunId และ match `/api/v1/dashboard`
- ตรวจทั้ง Summary, Filter, Desktop Table, Mobile Card, Modal และ Export Excel

## 4. Troubleshooting Matrix

| อาการ | แหล่งตรวจแรก |
| --- | --- |
| URL 404 | Dashboard คือ `/s2health-pa/`, ไม่มี `/s2health-pa/dashboard/` |
| Assets 404 | `next.config.ts`, Pages Workflow, `_next`, `.nojekyll` |
| หน้าโหลดไม่จบ | `useKPIData.ts`, Browser Network, Public API/Readiness, Retry |
| โหลดข้อมูลผิดพลาด | JSON Contract, CORS/HTTPS, Active Run IDs, Catalog/Result Identity |
| KPI หาย | Registry/Source-only Flag, Active Snapshot, Unknown Key/Result |
| Percent/Pass Rate ผิด | `kpi-utils.ts`, Raw-count/Zero Target/Zero Denominator/Filter Scope |
| Filter ไม่ตรง URL | `dashboard-url-state.ts`, `DashboardFilter.tsx`, `page.tsx` |
| Excel ไม่ตรง UI | `excel-export.ts`, Selected KPI/Facilities, Fiscal Year |
| API 503 / Sync Fail | Fastify Read API, Database State, `sync_runs`, `app_state`, Fedora logs ตามสิทธิ |
| Audit High | Lockfile/advisory provenance; ไม่ใช้ force fix แบบไม่มี Gate |

## 5. AI Agent / Developer Checklist

ก่อน Implement:
- [ ] อ่าน [ดัชนี](README.md) และ Documents ที่เกี่ยวข้องทุกส่วน
- [ ] อ่าน Latest Code/Tests/Policies ในทั้งสอง Repo; ตรวจ Actual HEAD ไม่พึ่งข้อมูลเก่า
- [ ] แยก Public UI, Backend API, DB, Host Infra และ Documentation Authority
- [ ] ระบุ Files, Accepted Scope, Test Strategy และ Rollback
- [ ] รักษา Run Consistency (Feature 031), KPI Semantics, Target/Raw-count, Browser/CORS/Data Privacy
- [ ] วาง Human Gate สำหรับ Main Merge, Pages Deploy, Backend/DB/CORS/Host Changes

หลัง Implement:
- [ ] Tests/Lint/Static Export/Boundary ผ่านบน Exact SHA
- [ ] Security Audit ระบุ Advisory Scope และประเมิน Risk/Compatibility
- [ ] External HTTP/API/Browser/UAT ผ่านหลัง Deploy ก่อน Final Acceptance
- [ ] Update System Documents, Frontend Upstream Authority, Release Evidence และ Issue Records

## 6. ต้องได้รับอนุญาตก่อนเสมอ

- Push/Merge Public `main` (**กระตุ้น GitHub Pages Deploy แม้เป็น Docs-only**)
- Deploy/Mutate Backend Container, Image Digest, PostgreSQL, MOPH Sync, Registry, Quadlet, Firewall, Tailscale Funnel หรือ Actions Variable
- เปลี่ยน Public API Schema ก่อน Backend Live Contract Verified
- Import `src/app/sync/`, GAS หรือ Internal Reverse Proxy จาก Upstream สู่ Public
- เพิ่มข้อมูลผู้ป่วย/Secret ใน Browser/Excel/Static Artifact
- Force Upgrade/Downgrade Dependencies, ยอมรับ CVE เพิ่มโดยไม่มีการทดสอบ/อนุมัติ
- ยอมให้ Dashboard/KPI Catalog คนละ Active Run หรือคำนวณ KPI Formula ซ้ำใน Browser

## 7. Operational / Security Debt

Residual Dev-only `braces@3.0.3` (Full Audit 5 High) ได้รับ Risk Acceptance เฉพาะ Release Security PR #29 และ Feature PR #28 โดยมีเงื่อนไขติดตาม Patch/Impact และ Reassess **ไม่เกิน 2026-11-09**. ไม่ใช่ Blanket Waiver ในอนาคต.

การมี `infra/quadlet` หรือ Runbook ไม่ได้ยืนยันว่า Timer, Backup, Restore, Monitoring หรือ Image Digest ใด Deploy แล้ว; ใช้ Host/Runtime Evidence จากผู้มีสิทธิเป็นหลัก.

## 8. Ready-to-use AI Handoff Prompt

> โปรดอ่าน docs/system/README.md รวมเอกสาร 01–09, README.md, docs/frontend-upstream.md และ Source/Tests ที่เกี่ยวข้องบน HEAD ที่ยืนยันใหม่. ระบบ Public เป็น Next.js Static GitHub Pages ไม่ใช่ Backend-v2 ซึ่งอยู่ใน pa-dashboard/Fedora. ก่อนแก้โปรดอธิบาย Impact, Scope, Contract, Tests, Rollback และ Human Gate. อย่า Merge main หรือ Deploy โดยไม่มี Explicit Approval. รักษา KPI Calculation Authority บน Backend, Feature 031 Run Consistency, Raw-count/Zero/Null Semantics, Public API/CORS/No Secrets และ Security Risk Controls.

*เอกสารนี้อธิบาย Source/Acceptance ณ 2026-10-11 ไม่ใช่ Live Host Inventory.*
