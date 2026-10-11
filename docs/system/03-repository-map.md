# 03 — โครงสร้าง Repository และหน้าที่ไฟล์

[กลับดัชนี](README.md) | [ต่อ: Feature Catalog](04-features.md)

## 1. `9GotStory/s2health-pa` — Public Edition

โครงสร้างจาก `main@7c617d20b573899613535168ad70bc835f342cc8` (แสดงไฟล์สำคัญและกลุ่ม Tests):

~~~text
s2health-pa/
├── .github/workflows/
│   ├── ci.yml                   # PR/main tests, lint, export boundary
│   └── pages.yml                # main -> build -> GitHub Pages
├── docs/
│   ├── frontend-upstream.md     # Upstream porting rules
│   ├── releases/                # Accepted historical release records
│   └── system/                  # คู่มือชุดนี้
├── public/.nojekyll             # Static asset serving
├── src/
│   ├── app/
│   │   ├── page.tsx             # Dashboard root, tabs, filters, states
│   │   ├── layout.tsx           # Metadata, fonts, toast provider
│   │   ├── loading.tsx          # Initial loading UI
│   │   ├── globals.css          # Theme/global styling
│   │   └── dashboard-url-state-contract.test.mjs
│   ├── components/
│   │   ├── DashboardFilter.tsx
│   │   ├── DashboardSkeleton.tsx
│   │   ├── DataStatusNotifier.tsx
│   │   ├── KPISummaryStats.tsx
│   │   ├── KPITable.tsx
│   │   ├── KPICardList.tsx
│   │   ├── KPICard.tsx
│   │   ├── KPIDetailModal.tsx
│   │   ├── PulseIndicator.tsx
│   │   ├── ui/table.tsx
│   │   └── *contract.test.mjs
│   └── lib/
│       ├── useKPIData.ts        # API requests, retries, abort, UI data state
│       ├── dashboard-data.ts    # API parsing, model, active-run consistency
│       ├── dashboard-url-state.ts
│       ├── kpi-utils.ts         # KPI semantics/target/aggregate
│       ├── kpi-grouping.ts      # Category/subgroup grouping
│       ├── excel-export.ts
│       ├── dashboard-time.ts
│       ├── types.ts             # DTO + UI types
│       ├── fonts.ts, utils.ts
│       └── *.test.ts / *contract.test.mjs
├── next.config.ts               # export, basePath, trailingSlash
├── package.json / package-lock.json
├── eslint.config.mjs
├── tsconfig.json
└── README.md
~~~

### File ownership — ต้องแก้อะไรเมื่อไร

| Feature / Concern | Canonical public files |
| --- | --- |
| หน้าหลัก, filter routing, tab | `src/app/page.tsx` |
| Filter หน่วยบริการและ KPI | `src/components/DashboardFilter.tsx` |
| Summary card / pass rate | `KPISummaryStats.tsx` + `src/lib/kpi-utils.ts` |
| ตาราง KPI Desktop และ Export button | `KPITable.tsx` |
| Mobile KPI cards | `KPICardList.tsx`, `KPICard.tsx` |
| Detail modal / keyboard | `KPIDetailModal.tsx` |
| Groups, category/subgroup order | `src/lib/kpi-grouping.ts` |
| Result + catalog normalization | `src/lib/dashboard-data.ts` |
| Fetch API + retry + abort | `src/lib/useKPIData.ts` |
| URL queries `cat/facility/kpi` | `src/lib/dashboard-url-state.ts` |
| Excel file generation | `src/lib/excel-export.ts` |
| GitHub Pages deployment | `.github/workflows/pages.yml` |

**ไม่มี** `src/app/dashboard/page.tsx` และไม่มี Public `src/app/sync/page.tsx`. Endpoint `/dashboard/` ตอบ 404 ได้โดยถูกต้อง; Dashboard อยู่ที่ Root ของ Pages Base Path.

## 2. `9GotStory/pa-dashboard` — Upstream/Backend

~~~text
pa-dashboard/
├── src/                       # Shared Next.js dashboard + internal /sync
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── scripts/                # Legacy GAS source (ไม่ใช่ Public API path)
├── backend/
│   ├── migrations/0001...0005 # SQL schema, constraints, config seed
│   ├── src/
│   │   ├── app.ts              # Fastify app assembly
│   │   ├── server.ts           # API process + graceful shutdown
│   │   ├── config/             # Server and DB config
│   │   ├── db/                 # pool and migration runner
│   │   ├── http/cors.ts
│   │   ├── modules/read-api.ts # Public read-only APIs
│   │   ├── observability/health.ts
│   │   ├── reference/populate.ts
│   │   └── sync/               # fetch, config, calculation, orchestration
│   └── test/                   # Unit, SQL integration & contracts
├── infra/
│   ├── containers/             # API/Web OCI Containerfiles
│   ├── quadlet/                # systemd Podman unit templates
│   ├── render-quadlets.mjs
│   └── test/deployment-contract.test.mjs
├── docs/architecture/
├── .github/workflows/          # Backend CI/OCI workflows
└── README.md
~~~

**อย่าเข้าใจผิด:** Upstream มี internal Web, Legacy GAS และ Infra Artifacts อยู่ร่วมกันใน Repo แต่ Public Pages ไม่ได้ใช้ทุกส่วน. ต้องตรวจ Branch/Commit ที่ปล่อยจริงก่อนสรุป Runtime ล่าสุด โดยเอกสารชุดนี้อ้างอิง Upstream `develop@a386269...` ที่ได้รับการยอมรับสำหรับ Feature 031 เท่านั้น

## 3. ลำดับเปิดไฟล์เมื่อ Debug

- KPI ไม่ขึ้น: `useKPIData.ts` → `dashboard-data.ts` → Public API responses → Backend `read-api.ts`
- Percent/Pass ผิด: `kpi-utils.ts` → `KPISummaryStats.tsx` / `KPITable.tsx` / `KPICard.tsx` → Backend calculation
- Filter/URL ผิด: `dashboard-url-state.ts` → `page.tsx` → `DashboardFilter.tsx`
- Export ผิด: `excel-export.ts` + Contract Test
- Deployed Assets 404: `next.config.ts` + `pages.yml` + `/s2health-pa/`
- Sync/data stale: `backend/src/sync/orchestrator.ts`, `run.ts`, `read-api.ts`, `app_state`/`sync_runs` และ Host logs (ตามสิทธิ)
