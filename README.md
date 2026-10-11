# s2health-pa

## System documentation (Thai)

อ่าน [คู่มือระบบฉบับสมบูรณ์](docs/system/README.md) สำหรับภาพรวม สถาปัตยกรรม โครงสร้างโค้ด ฟีเจอร์และ KPI Catalog, API/Data Model, Deployment, Security, Testing และคู่มือพัฒนาต่อ (ตรวจสอบจาก Source/Release ณ 2026-10-11).

S2Health PA source repository for the Song District Health network: Next.js public frontend **and** Fastify Backend-v2, PostgreSQL SQL migrations, MOPH sync engine, reference-data tools and backend tests.

## Public URL

https://9gotstory.github.io/s2health-pa/

## Architecture

- Frontend source: `src/` — Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Backend source: `backend/` — Node.js 24 + Fastify 5 + PostgreSQL 18 schema migrations, sync, tests
- Hosting: GitHub Pages static export
- Public API: Fedora `pa-dashboard-api`
- Public API ingress: Tailscale Funnel over HTTPS
- Database: PostgreSQL on Fedora
- Monitoring: Prometheus / Grafana on Fedora

The public frontend was originally adapted from the proven Backend-v2 frontend
in `9GotStory/pa-dashboard`. The accepted backend implementation has now been
imported byte-for-byte into `backend/`. **New S2Health PA frontend and backend
changes belong in this repository**, while `pa-dashboard/main` continues as the
legacy Apps Script + Google Sheets system. Infrastructure/OCI source migration
and Fedora runtime cutover are separately gated work; source import is not deployment.

## Frontend upstream

Historical accepted frontend upstream baseline:

- Repository: `9GotStory/pa-dashboard`
- Source branch: `develop`
- Source SHA: `a3862692c7ffd8dda3c593fd029e1bb67b7fd68b`

The immutable Frontend Stabilization release baseline remains
`a7df59805a405097d64268f0dfbc4538b3f7cbf3`; the authority above includes
accepted Phase 2 shared frontend changes after that release.

The imported surface includes the dashboard page, filters, summary cards,
desktop table, mobile KPI cards, detail modal, export support, API contract
validation, grouping logic, KPI utilities, and related tests.

Public-only adaptations are intentionally limited to:

- Next.js static export for GitHub Pages
- GitHub Pages base path `/s2health-pa`
- public Backend-v2 API origin supplied at build time
- S2Health branding/metadata
- removal of internal `/sync`, container rewrites, and GAS deployment concerns

See `docs/frontend-upstream.md` for the original frontend synchronization boundary,
and `SOURCE_PROVENANCE.md` for the Backend-v2 exact-SHA import and database
compatibility record. The `docs/system/` manual documents the public frontend
release baseline and will receive a separate whole-repository update.

## Public API configuration

The Fedora endpoint is not hardcoded into source.

GitHub Actions maps the repository Actions variable:

`PUBLIC_API_BASE_URL`

to the public Next.js build variable:

`NEXT_PUBLIC_API_BASE_URL`

The value is public configuration, not a secret. The Pages workflow validates
that it is an exact HTTPS origin before building.

The frontend reads:

- `/api/v1/dashboard`
- `/api/v1/kpis`
- `/api/v1/facilities`
- `/api/v1/tambons`

Backend-v2 is the KPI calculation authority. Frontend code validates and
aggregates already-calculated rows for presentation; it does not reimplement
the KPI calculation rules.

## Development

Requirements:

- Node.js 24
- npm

Commands:

```sh
npm ci
npm run test:dashboard
npm run test:kpi-semantics
npm run test:url-state
npm run test:excel-export
node --test src/lib/kpi-type-filter-contract.test.mjs
node --test src/lib/kpi-target-resolution-contract.test.mjs
node --test src/components/kpi-summary-availability-contract.test.mjs
node --test src/components/accessibility-contract.test.mjs
npm run lint
npm run dev
```

Production static export:

```sh
NEXT_PUBLIC_API_BASE_URL=https://example.invalid \
NEXT_PUBLIC_BASE_PATH=/s2health-pa \
npm run build
```

The export is written to `out/`.

## Backend development and verification

The import deliberately keeps the original `backend/package.json` and SQL files
byte-identical to their verified source. Run these commands in a Node.js 24
development environment (never against production data):

```sh
cd backend
npm ci
npm run typecheck
npm run build
node --test dist/test/*.unit.test.js dist/test/database-foundation.static.test.js
```

Tests requiring PostgreSQL must use an **isolated disposable PostgreSQL 18**
database and an explicit authorization; do not use production credentials.

## Boundaries

- Merging source alone does not alter the private PostgreSQL or Fedora runtime.
- It does not contain database credentials, Tailscale auth keys, or secrets.
- It does not expose the API container directly to LAN/WAN.
- Public KPI reads do not use the legacy Google Apps Script data path.
- It does not import the internal `/sync` surface from `pa-dashboard`.
- The existing `pa-dashboard` deployment remains independent.
