# s2health-pa

Public S2Health PA frontend for the Song District Health network.

## Public URL

https://9gotstory.github.io/s2health-pa/

## Architecture

- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Hosting: GitHub Pages static export
- Public API: Fedora `pa-dashboard-api`
- Public API ingress: Tailscale Funnel over HTTPS
- Database: PostgreSQL on Fedora
- Monitoring: Prometheus / Grafana on Fedora

The public frontend is adapted from the proven Backend-v2 frontend in
`9GotStory/pa-dashboard`. Shared dashboard behavior should be reused from that
upstream rather than independently reimplemented here.

## Frontend upstream

Current shared frontend authority:

- Repository: `9GotStory/pa-dashboard`
- Source branch: `develop`
- Source SHA: `4c9ab95969b4e5f2716e36426e3d3f9bd43f4ad1`

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

See `docs/frontend-upstream.md` for the synchronization boundary.

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

## Boundaries

- This repository does not modify the private PostgreSQL or Fedora runtime.
- It does not contain database credentials, Tailscale auth keys, or secrets.
- It does not expose the API container directly to LAN/WAN.
- It does not use the legacy Google Apps Script data path.
- It does not import the internal `/sync` surface from `pa-dashboard`.
- The existing `pa-dashboard` deployment remains independent.
