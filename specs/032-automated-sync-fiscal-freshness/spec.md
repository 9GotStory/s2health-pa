# Feature 032 — Safe Automated Sync, Fiscal Year, Data Freshness

**Status:** Draft specification; **source only**, not implementation or deployment approval  
**Source baseline:** `9GotStory/s2health-pa` `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Tracking:** [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38) · [Draft PR #39](https://github.com/9GotStory/s2health-pa/pull/39)  
**Companions:** [research.md](research.md) · [plan.md](plan.md) · [tasks.md](tasks.md)

## Goal

Reuse the **existing** MOPH Sync Engine, PostgreSQL run lifecycle and Feature 031 dashboard/catalog consistency. Deliver only:

1. **Automated Sync:** safe, explicitly authorized scheduled re-execution of the existing one-shot unit.
2. **Fiscal Year Management:** explicit approved FY/Q and source-readiness checks; never switch FY merely because the calendar changed.
3. **Data Freshness:** distinguish successful sync/activation from the upstream source update date, with source-level freshness available for operator diagnosis.

No rewrite of KPI calculation, new database, new public admin UI, or new observability stack.

## Verified starting state (historical, 2026-10-12)

Production one-shot Sync succeeded: Active Run **#2**, FY **2569/Q4**, 18/18 physical sources, 11,141 source records, 3,004 KPI results, 47 public KPI catalog members. `sourceLastUpdated=202610120606` is the greatest valid `date_com` marker, **not** proof every source updated then. Config remained FY2569/Q4; FY2570 probe returned zero rows for two tested sources, not a full 18-source census. Rootless Fedora `websvc`, Podman 5.8.4, systemd 259; the sync service is a manually triggered one-shot and no named sync timer is installed. Monitoring services are operational; advanced alerting investigation is **deferred**, not a prerequisite for source development.

## Requirements

- **R1 / Exact target gate:** With the existing PostgreSQL advisory lock held, and **before creating** a new `sync_runs` row, compare a separately authorized FY, quarter, province and district against the actual `app_settings` and derived district scope. Missing/expired/mismatched approval → no writing run. Do not modify settings on a timer tick. Verify source revision and immutable OCI image digests **at the distinct release/cutover gate**; do not claim the worker can cryptographically prove its own OCI digest from a mutable environment variable.
- **R2 / Preserve core contract:** Use existing 18 physical sources, 34 virtual definitions and 5 source-only physical definitions (52 total; 47 public). Keep `pg_try_advisory_lock`, run-linked records, `succeeded` transition, and atomic `active_sync_run_id` activation; never activate incomplete/failed datasets.
- **R3 / Controlled worker lifecycle:** Add an explicit HTTP timeout and bounded retry policy. Handle transport errors, invalid/empty source data, crashed/interrupted jobs and ambiguous exits without blind retries or automatic activation. No unrelated schema migration.
- **R4 / Timer packaging:** Add a **disabled-by-default**, rootless systemd user timer targeting `pa-dashboard-sync.service`; calendar/time zone/jitter and skip-missed-run policy are proposed, not yet approved. Keep existing unit identity/network/volume. Never install or enable in this documentation gate.
- **R5 / Fiscal rollover:** Calendar FY, configured Sync FY and published dataset FY are different. FY2570 publication requires source evidence and separate Product Owner approval. Keep active FY2569 honestly labeled if FY2570 cannot be published.
- **R6 / Freshness semantics:** Retain `dataset.activatedAt` and source marker provenance. Distinguish per-source `date_com` from successful sync time, validate source marker shape (12 or 14 digits) and calendar bounds. Do not infer upstream timezone. Prefer read-only operator summary from existing tables over public API or DB changes.
- **R7 / Public consistency:** Preserve `/api/v1/dashboard`, `/api/v1/kpis`, their decimal run IDs and Feature 031 bounded cross-run refetch; changes to public API/UI are a separately scoped choice.
- **R8 / Delivery:** Tests against disposable PostgreSQL 18, source fixtures, calendar fixtures, source-only/zero-target KPI regression, exact-SHA independent review; separate authorization for merge, OCI release, Fedora cutover, timer enablement, and FY2570 first publication.

## Acceptance scenarios

| Case | Expected |
| --- | --- |
| Authorized FY2569/Q4 manual/scheduled test with all 18 valid sources | New run `succeeded`, single atomic activate; dashboard/catalog run IDs agree |
| Target FY/Q/geography differs from explicit approval | Reject **before** creating a writing run; previous active pointer unchanged |
| OCI image/source digest differs from reviewed release | Block **host deployment/enablement gate**; no unapproved worker image cutover |
| One of 18 sources is empty, malformed, unavailable or wrong-scope | Candidate not activated; old dataset remains readable |
| Concurrent manual and scheduled start | Only one obtains PostgreSQL advisory lock |
| Worker stops after creating `running` run | Orphan detectable, not automatically marked succeeded; operator reconciliation required |
| Calendar reaches FY2570 but upstream not ready | No automatic FY switch or misleading FY2570 dashboard |
| All 18 source calls succeed but some update markers are stale | Report sync success and source freshness as **different statuses** |
| Timer absent/disabled | Manual one-shot remains available only under explicit operational authorization; existing dashboard unaffected |

## Exclusions and outstanding decisions

**Out of scope:** Grafana/Prometheus UI inventory, new alert delivery routes, historical multi-FY selector, KPI refactor, new deployment topology, Production database write or sync under this PR.

**Owner decisions still required:** the minimal T001 policy set is in [plan.md](plan.md#t001--minimum-product-policy-proposed-not-yet-accepted). Proposals include 08:00 Asia/Bangkok plus 0–30m jitter, a provisional 30-minute ceiling, `Persistent=false`, no unattended FY2569 backfill, a separate FY2570 first activation gate and operator-only freshness v1. **No default is accepted by silence.**

**Current authority:** Draft Spec Kit only. No Merge, code implementation, timer enablement, OCI publication, app setting mutation or Production Sync.
