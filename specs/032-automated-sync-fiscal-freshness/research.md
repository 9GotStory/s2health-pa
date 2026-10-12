# Feature 032 — Research & Architecture Decision Record

**Status:** DRAFT — Independent architecture review; no host actions  
**Evidence cutoff:** 2026-10-12 / `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Related:** [spec.md](spec.md), [plan.md](plan.md), [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38)

## 1. Verified facts vs unverified design assumptions

| Fact | Evidence | Implication |
| --- | --- | --- |
| Production one-shot recovery completed on 2026-10-12 | SQL + `/api/v1/sync-status`: active Run #2, FY2569 Q4, 18/18 sources, 11,141 source rows, 3,004 KPI rows; `/api/v1/kpis` has 47 entries | New baseline; **not** permission for recurring writes |
| Last activation | `2026-10-12T08:35:41.704Z` (15:35:41 Asia/Bangkok) | Separate activation time from MOPH `date_com=202610120606` |
| Current FY setting remains 2569/Q4 | Read-only PostgreSQL audit | Timer on existing unit would sync FY2569 |
| OpenData FY2570 returned zero rows for `s_dm_screen`, `s_epi1` | User-executed POST probe returning HTTP 201, rows=0 | Do not assume remaining sources or FY2570 are ready |
| OpenData FY2569 returned rows for all 18 sources | User-executed direct probe; HTTP 201 and nonempty arrays | Source connectivity verified **at that probe time**, not a future SLA |
| Old Worker image used for recovery | `pa-dashboard-api@sha256:3ac723826d793f7394dc00c8e65a9949ee3398a7e29b682410e08f5c4800b535`, OCI source revision `0c70f3efce843b92b2a96c884bc036fde9f9f8dc` | Separate image-parity gate before scheduler enablement |
| API image | `pa-dashboard-api@sha256:02552be6f42dde9570e24186f720c6b293dab70b68e36916947e12254a20430b`, revision `a3862692c7ffd8dda3c593fd029e1bb67b7fd68b` | Old Worker and API are not same revision |
| Quadlet sync source | `infra/quadlet/pa-dashboard-sync.container.in` | Manual `Type=oneshot`, no Install/timer; requires migrate |
| Public read contract | `backend/src/modules/read-api.ts`, `src/lib/dashboard-data.ts` | Active run consistency and public aggregate-only boundary remain |
| Monitoring | Production Prometheus/Grafana and metrics exporter running; latest config/rules **not assessed in this phase** | Integration must inspect real metric names before proposing alert expressions |

## 2. Source audit and risks

- `backend/src/sync/config.ts` takes `current_year`, `current_quarter`, `province_code` from `app_settings` and derives fiscal year from year setting; **no automatic rollover**.
- `backend/src/sync/moph-client.ts` sends HTTPS POST to `/api/report_data`, has bounded transport attempts (max 3), and rejects empty arrays. It accepts 12- and 14-digit source markers as raw data; source freshness normalization is a separate concern.
- `backend/src/sync/lock.ts` implements PostgreSQL session advisory lock; do not replace or assume systemd alone provides cross-host exclusion.
- `backend/src/sync/orchestrator.ts` creates a `running` run, saves sources and KPI results, transitions to `succeeded`, then atomically activates through `app_state`. It has explicit failure handling for source/calculation/persistence errors. A hard kill **may leave** an unfinished `running` run; reconciliation must be designed/tested, not inferred safe.
- `backend/src/modules/read-api.ts` returns latest status, and dashboard source marker derives from `MAX(date_com)` on active run. A single newer source can mask other stale sources.
- `infra/README.md` explicitly defers timer installation and enforces immutable OCI digests, isolated cutover gates and same existing service/volume topology.
- `.github/workflows/pages.yml` deploys on `main` changes in frontend allowlist paths, not docs-only specs; draft PR is not a Pages deployment.
- Existing FY2569/older Q4 dataset remains public if new FY data absent; no year-label inference from wall clock.

## 3. Scheduler architecture alternatives

| Option | Advantages | Risks / decision |
| --- | --- | --- |
| **A. Rootless systemd timer → existing Quadlet one-shot** | Existing service identity, journald evidence, Podman/SELinux ownership, manual and scheduled entry point shared | **Preferred** subject to strict preflight, watchdog, image parity and separate enable gate |
| B. Cron calling `podman run` | Simple | Duplicates scheduler and escapes service lifecycle/observability; reject |
| C. Long-running in-API scheduler | One process to operate | Coupled to API uptime, multi-instance/redeploy race, DB permission surface; reject |
| D. GitHub Actions/public service trigger | Convenient UI | Requires external production mutation endpoint and secrets; reject |

**Decision ADR-032-01 (proposed):** systemd user timer targeting `pa-dashboard-sync.service`; `Persistent=true` only after evaluating catch-up behavior and FY gate. A deployment test must prove `Unit=` references the correct service, no unintended initial start, expected timezone, `RandomizedDelaySec` and bounded execution.

## 4. Fiscal year architecture

- **Calendar FY:** Thailand government FY `2570` begins 2026-10-01. This does **not** imply MOPH endpoint is populated for that FY.
- **Configured sync FY:** One-shot worker currently reads `app_settings.current_year`; automated runner must *not* change the setting implicitly.
- **Source-ready FY:** verified against all 18 physical sources, valid FY and geographic scope, non-empty rows and meaningful KPI calculations; readiness evidence expires and is rechecked at activation.
- **Published FY:** `sync_runs.fiscal_year/current_quarter` pinned to `app_state.active_sync_run_id`; user-visible dataset must use these values, not today.
- **Decision ADR-032-02 (proposed):** maintain explicit Product Owner approval for first FY2570 publication. Read-only probe may operate independently from publication; no premature switch while FY2570 sources empty. Historical FY2569 remains in DB; true multi-year querying/presentation needs separate API and retention design and is not silently implied by storing historical runs.

## 5. Freshness and status data architecture

Three different timestamps / concepts:
1. `last_attempt_started_at` and `last_attempt_finished_at` (whether service executed).
2. `last_successful_activation_at` from active successful `sync_runs` (when dataset was published).
3. `source_date_com` per source, with parsed shape, original marker and unknown upstream timezone when not documented. Summaries should expose min/max/coverage and oldest/stale source counts; never rely only on global max.

A successful fetch does **not** necessarily mean source content was updated; some sources legitimately have unchanged counts. Explicit freshness policy per source/expected update window; avoid blanket daily freshness failure.

**Decision ADR-032-03 (proposed):** compute operator status from existing run/source records where feasible before adding any new public API or schema. Extend public API only if needed, as aggregate-only, backwards compatible and feature-gated; preserve `syncRunId` for all dataset-bound fields.

## 6. Failure model and required guards

- **No sync attempt / timer absent:** alert on missing successful activation while distinguishing deliberate maintenance/disabled schedule.
- **Transport/schema/empty source:** persist failed attempt, leave current active pointer unchanged; alert without dumping raw payload.
- **Concurrent start:** DB advisory lock rejects competitor; systemd job state provides local deduplication, not database-wide exclusivity.
- **Hard kill / host reboot:** potential orphan `running` row; define detection and **operator-controlled** reconciliation after DB evidence. Never automatically mark a partially written run succeeded.
- **Timeout / delayed OpenData:** execution budget, bounded fetch retries/jitter, distinguish temporary upstream outage from semantic empty data.
- **FY transition:** timer runs only authorized configured FY until explicit change approval; source-ready probe may be read-only; historical view is not re-labeled as FY2570.
- **Wrong image digest:** fail deployment preflight before timer enablement; align API/sync/migrate revisions through a separate OCI/runtime cutover with rollback digest.
- **Monitoring blind spot:** exporter/Prometheus/Grafana up does not imply rules/receiver/routing exist; verify labels, metric names and provision separately.

## 7. Proposed release choreography (not authorized here)

1. Approve specification and calendar/retention/alert policies.
2. Implement and test in `s2health-pa` feature branch against disposable PostgreSQL; no live sync.
3. Exact-SHA review/CI/security/contract/integration evidence; separate merge approval.
4. OCI publish approval and immutable digest review; no automatic host deploy.
5. Fedora host inspection, fresh backup with isolated restore and exact unit/image diff review; host cutover approval.
6. Timer dry-run/static verification followed by **independent timer enablement authorization**; observe first scheduled execution and both API/run identities.
7. FY2570 first activation gated by new evidence + explicit authority; no automatic fallback to partial/new FY.
8. Document rollback: disable timer first, preserve last good active dataset, then approved host/service/image reversal; no automatic DB pointer rollback.

## 8. Review findings

- **F032-01 High:** Enabling a timer with FY2569/Q4 in current settings would repeatedly refresh last FY instead of moving to FY2570. Mitigation: explicit authorized-FY gate; do not enable now.
- **F032-02 High:** Service can be invoked with historically different OCI image revision from running API. Mitigation: exact revision/digest parity or independently tested compatibility before scheduler cutover.
- **F032-03 High:** Global `MAX(date_com)` overstates whole-dataset freshness. Mitigation: per-source freshness/coverage.
- **F032-04 Medium:** Abrupt worker termination might leave a `running` entry. Mitigation: expiration detection, operator-controlled reconciliation, integration test.
- **F032-05 Medium:** Timer catch-up after downtime can produce an unexpected write. Mitigation: preflight authorized FY, `Persistent` policy, initially disabled host timer and explicit commissioning.
- **F032-06 Medium:** Systemd job exit success is not a substitute for verified active run + API consistency. Mitigation: post-run evidence, alarms and semantic checks.

**Architecture review verdict:** **CONDITIONAL / NOT IMPLEMENTATION-READY.** Address policy decisions and test plans before the implementation gate.
