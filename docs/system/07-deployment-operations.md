# 07 — Development, Build, CI, Deploy และ Operations

[กลับดัชนี](README.md) | [ต่อ: Security & Quality](08-security-quality.md)

## 1. Local Development สำหรับ Public Frontend

ต้องมี Node.js 24 และ npm; ติดตั้ง Dependencies จาก Lockfile ด้วย `npm ci`.

~~~bash
npm ci
npm run dev

# regression groups
npm run test:dashboard
npm run test:kpi-semantics
npm run test:url-state
npm run test:excel-export
node --test src/components/dashboard-filter-state-contract.test.mjs
node --test src/lib/dashboard-time.test.ts
node --test src/lib/kpi-type-filter-contract.test.mjs
node --test src/lib/kpi-target-resolution-contract.test.mjs
node --test src/components/kpi-summary-availability-contract.test.mjs
node --test src/components/accessibility-contract.test.mjs
npm run lint
~~~

Build Static Export (ใช้ Origin ตัวอย่างเฉพาะเพื่อทดสอบ Build, **ไม่ใช่ Live API**):

~~~bash
NEXT_PUBLIC_API_BASE_URL=https://example.invalid NEXT_PUBLIC_BASE_PATH=/s2health-pa npm run build
test -f out/index.html
test -d out/_next
~~~

ใน Local Dev ต้องตั้ง `NEXT_PUBLIC_API_BASE_URL` เป็น Exact HTTPS Origin ที่อนุญาต หรือ Local HTTP (localhost/127.0.0.1) ตาม Code; ถ้าทดสอบด้วย Dummy `example.invalid` จะ Build ผ่านแต่โหลดข้อมูลจริงไม่ได้.

## 2. GitHub Actions: สอง Workflow

| Workflow | Trigger | สิ่งที่ตรวจ/ทำ |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull Request และ Push main | `npm ci`, regression tests, ESLint, Static Export, Boundary |
| `.github/workflows/pages.yml` | Push main และ manual dispatch | ตรวจ `PUBLIC_API_BASE_URL`, Build ด้วย URL จริง, Tests, Export/Leak Checks, Upload Pages Artifact, Deploy |

**สำคัญอย่างยิ่ง**: **Merge เข้า main = เริ่ม Public Pages Deploy อัตโนมัติ**. แม้แก้ Documentation-only ก็จะ trigger Pages Workflow. อย่า Merge/Push Main โดยไม่มี Human Release Authorization และแผนตรวจหลัง Deploy.

CI ใช้ Dummy HTTPS Origin ไม่สามารถแทนการทดสอบ CORS/Contract จริงหลัง Deploy. Pages Workflow ใช้ Repo Actions Variable `PUBLIC_API_BASE_URL` (ค่าต้องเป็น Exact HTTPS Origin, ไม่มี Path/Query/Auth); Next Bundle ฝัง URL นี้ตอน Build.

## 3. Build/Deploy Boundary

- `next.config.ts`: `output: 'export'`, `basePath: NEXT_PUBLIC_BASE_PATH`, `trailingSlash: true`
- `out/` เป็น Build Artifact ไม่ใช่ Source Truth; GitHub Pages Upload จาก Artifact นี้
- `.nojekyll` ช่วยให้ `_next` Static Assets ใช้งานกับ GitHub Pages
- Runtime ไม่มี Node.js Backend บน Pages; API ต้องมีชีวิตและ CORS ถูกต้องบน Fedora/Funnel แยกต่างหาก
- Public origin ไม่ควร hardcode ใน Code; การเปลี่ยน Repo Variable ต้อง Rebuild/Deploy ที่อนุมัติใหม่

## 4. Fedora/Backend Operations (แนวคิดจาก Repo, ไม่ใช่การอนุญาตดำเนินการ)

Infrastructure Templates อยู่ที่ `pa-dashboard/infra/`:
- rootless Podman / Quadlet, SELinux Enforcing; ใช้ Production owner และ Permission ที่ได้รับอนุญาต
- DB volume: PostgreSQL 18, Private Network; ไม่มี Host DB Port
- API image/container ใช้กับ HTTP Server, Migration One-shot, Reference Populate One-shot และ Sync One-shot
- API loopback host ingress ตาม Foundation `127.0.0.1:13001 → container:3001`; Funnel แยกจาก Quadlet
- Existing Prometheus/Grafana เป็น Platform Assets; ห้ามถือว่าการมีไฟล์ใน Infra เป็นการ Deploy บริการใดไปแล้ว

Backend Package Commands (ใน `pa-dashboard/backend` และต้องผ่าน Authorization ก่อนใช้จริง):

~~~bash
npm ci
npm run build
npm run typecheck
# production mutations: only under approved gates
npm run migrate
npm run reference:populate
npm run sync
~~~

**อย่ารัน** `migrate/reference:populate/sync` กับ Production DB แบบทดลอง. Sync ทุกครั้งต้องมี Run Evidence และตรวจ Active Run ไม่ถูกเปลี่ยนโดยข้อมูลผิด.

## 5. Backup / Recovery / Monitoring

- แนวทาง DB Backup เป็น **logical `pg_dump`**, ไม่ใช่การ Copy PostgreSQL Data Volume แบบ Raw; Restore Test เป็น Acceptance Gate
- ใช้ Recovery/Backup Procedure ที่ผ่าน Host-side Review จริง; เอกสาร ADR/Infra ระบุ Architecture Target ไม่ใช่หลักฐานว่า Backup Schedule/Restic Integration แต่ละตัวเปิดใช้แล้ว
- ตรวจ API Liveness `/api/v1/health/live`, Readiness `/api/v1/health/ready`, Sync Audit `/api/v1/sync-status`
- ตรวจ Prometheus/Grafana กับ Logs/Host units ตามสิทธิ; Public Pages CI ไม่แทนความพร้อม Runtime API
- อย่าแก้ OCI Image Digest, Quadlet, CORS, Firewall, Funnel, Host Env หรือฐานข้อมูลจาก PR Frontend Documentation

## 6. Release Checklist (ตัวอย่าง)

1. ระบุ GitHub Base SHA และ Feature HEAD SHA ที่ตรวจสอบได้
2. Independent Review + Exact Commit CI + Tests/Audit/Dependency Diff
3. ตรวจ Public API Version/Contract/CORS บน Origin ที่ Deploy จริงก่อนอนุมัติ Merge
4. Product Owner อนุมัติ **Merge และ Consequent Auto-Deploy** อย่างชัดเจน
5. Squash Merge พร้อม Expected Head SHA guard เฉพาะ PR ที่อนุญาต
6. ตรวจ Main SHA ใหม่, CI Push + Pages Deploy บน SHA เดียวกัน Success
7. จากเครื่องภายนอกทดสอบ Root HTML, `_next` JS/CSS, 4 API, Run IDs, CORS
8. Browser UAT: โหลดเสร็จ, Cards/Table แสดง, ไม่มี Data Load Error
9. บันทึก Evidence ใน PR/Issue และปิดเมื่อ Acceptance ครบ
10. ติดตาม CVE/Operational Debt แยกจาก Feature Closure

## 7. ประวัติ Release อ้างอิง

- 2026-10-07: [Frontend Stabilization](../releases/frontend-stabilization-2026-10-07.md)
- 2026-10-10: Security PR #29 (Next.js 16.4.0 และ Dependency Pin) `eea539171a054c845f6c297545fd550e8a66a48a`
- 2026-10-11: Feature 031 PR #28 `7c617d20b573899613535168ad70bc835f342cc8`; [CI](https://github.com/9GotStory/s2health-pa/actions/runs/38113542848) / [Pages](https://github.com/9GotStory/s2health-pa/actions/runs/38113542878) SUCCESS, Fedora Postdeploy Smoke + Browser UAT PASS

เมื่อมี Release ใหม่ ให้เพิ่มแถว/หมายเหตุโดยไม่เปลี่ยนหลักฐาน Release เก่าที่เป็น Immutable Baseline.
