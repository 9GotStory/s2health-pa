# Frontend upstream policy

## Purpose

`s2health-pa` is the public GitHub Pages edition of the PA dashboard. It should
reuse the proven dashboard frontend from `9GotStory/pa-dashboard` instead of
maintaining a second independently designed dashboard implementation.

## Current import authority

- upstream repository: `9GotStory/pa-dashboard`
- upstream branch: `develop`
- imported source SHA: `7e2be80247b996fa2fd23d134433148061cb8506`

## Shared surface

These areas are expected to stay conceptually aligned with upstream:

- `src/app/page.tsx`
- `src/app/dashboard-url-state-contract.test.mjs`
- `src/components/DashboardFilter.tsx`
- `src/components/dashboard-filter-state-contract.test.mjs`
- `src/components/DashboardSkeleton.tsx`
- `src/components/DataStatusNotifier.tsx`
- `src/components/KPICard.tsx`
- `src/components/KPICardList.tsx`
- `src/components/KPIDetailModal.tsx`
- `src/components/KPISummaryStats.tsx`
- `src/components/kpi-summary-availability-contract.test.mjs`
- `src/components/KPITable.tsx`
- `src/components/accessibility-contract.test.mjs`
- `src/components/ui/table.tsx`
- `src/lib/dashboard-data.ts`
- `src/lib/dashboard-data.test.ts`
- `src/lib/dashboard-url-state.ts`
- `src/lib/dashboard-url-state.test.ts`
- `src/lib/excel-export.ts`
- `src/lib/excel-export-contract.test.mjs`
- `src/lib/kpi-grouping.ts`
- `src/lib/kpi-utils.ts`
- `src/lib/kpi-utils.test.ts`
- `src/lib/kpi-type-filter-contract.test.mjs`
- `src/lib/kpi-target-resolution-contract.test.mjs`
- `src/lib/types.ts`
- `src/lib/utils.ts`

## Intentional public-edition differences

Do not blindly overwrite these when syncing from upstream:

- `next.config.ts` — static export + GitHub Pages base path
- `src/lib/useKPIData.ts` — public HTTPS API origin instead of same-origin rewrite
- `src/app/layout.tsx` — public metadata/language
- `src/app/page.tsx` — S2Health naming/font adaptation only; dashboard behavior should stay aligned
- `.github/workflows/*` — GitHub Pages build/deploy
- `README.md` and this file

Do not import:

- `src/app/sync/`
- GAS scripts or clasp configuration
- Backend, infra, Quadlet, OCI, or private deployment files
- internal Next.js rewrite to `pa-dashboard-api:3001`

## Change rule

When a shared dashboard behavior changes in `pa-dashboard`, prefer porting that
change here from the upstream implementation. Avoid creating a parallel
implementation unless the public edition has a documented requirement that is
not applicable upstream.
