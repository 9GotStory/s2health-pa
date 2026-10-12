# Feature 032 — Source Review and Architecture Decisions

**Status:** Draft technical assessment only; no implementation authorization  
**Source inspected:** `9GotStory/s2health-pa` `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Companions:** [spec.md](spec.md) · [plan.md](plan.md) · [tasks.md](tasks.md)

## Existing Sync Engine (verified in repository)

| Source | What already works | What Feature 032 should change |
| --- | --- | --- |
| `backend/src/sync/run.ts` | Creates DB pool, invokes one orchestration run, logs summary, exits nonzero on error | Reuse entrypoint; add safe preflight integration without changing manual compatibility |
| `backend/src/sync/config.ts` | Reads `current_year`, `current_quarter`, `province_code` from PostgreSQL `app_settings`; validates 52 KPI definitions (18 physical, 34 virtual, 5 source-only) | Explicit independent approval for target FY/Q/geography; do not infer FY from current date |
| `backend/src/sync/lock.ts` | Session `pg_try_advisory_lock(20260912,1)` and cleanup | Preserve; test overlap manual/timer and lock failure exit |
| `backend/src/sync/moph-client.ts` | HTTPS POST to `report_data`, validates nonempty object arrays, transport retry max 3, inter-source jitter about 4–7s | Current `fetch` has **no explicit per-request abort timeout**; design a deadline, failed-source semantics and bounded retry |
| `backend/src/sync/orchestrator.ts` | Creates `running` run, fetches/persists physical sources, calculates/persists KPI, marks succeeded and atomically activates | Gate **before** run INSERT; hard-kill and succeeded-but-not-activated reconciliation; avoid rewrites |
| `backend/src/modules/read-api.ts` | Public `/dashboard`, `/kpis`, `/sync-status`; active run IDs; valid `date_com` global MAX for sourceLastUpdated | Per-source freshness read-only model, preserve existing public contract and Feature 031 |
| `infra/quadlet/pa-dashboard-sync.container.in` | `Type=oneshot`, no install/timer; `Requires=pa-dashboard-migrate.service` | Package disabled user timer separately; **starting Sync can trigger migrate dependency**; prove safety before commissioning |
| `backend/test/sync-*.test.ts` | Unit and isolated PostgreSQL integration suites already exist | Extend existing tests; do not invent a replacement test harness |

### Verified operational baseline (2026-10-12; historical evidence)

Human-authorized one-shot FY2569/Q4 succeeded: active Run #2, 18/18 physical sources, 11,141 source rows, 3,004 KPI result rows, KPI catalog 47, latest valid source marker `202610120606`. Fedora `websvc` user manager active, Podman 5.8.4, systemd 259, Asia/Bangkok; `pa-dashboard-sync.service` loaded/inactive and `pa-dashboard-sync.timer` absent. Installed Sync worker image uses `pa-dashboard-api@sha256:3ac723826d793f7394dc00c8e65a9949ee3398a7e29b682410e08f5c4800b535` while running API uses `pa-dashboard-api@sha256:02552be6f42dde9570e24186f720c6b293dab70b68e36916947e12254a20430b`; do not assume image parity, auto-replace either one, or rerun Sync.

Earlier FY2570 OpenData samples returned empty arrays for 2 of the 18 sources. **Not sufficient to declare all FY2570 sources unready or ready**; a full, rate-limited readiness check belongs to the dedicated fiscal gate.

Existing Prometheus syntax: valid; 2/2 live scrape targets UP; 0 managed Prometheus rules and 0 active external Alertmanager endpoints. Grafana runs with 0 static alert-provisioning files and 1 data-source/1 dashboard provisioning file. **Grafana UI-managed alerting is unknown**. Record as context only; not a feature design blocker and no further monitoring forensics in this PR.

## Design decisions

1. **D032-A (preferred): Existing Sync + safe preflight**, not a new Sync engine. `runMophSynchronization` currently enters the existing PostgreSQL advisory lock, loads `app_settings` and district scope, **then** calls `createRunningSyncRun`. The approved FY/Q/geography guard belongs **within that lock and before the INSERT**. OCI image/source digest identity is independently verified by the host release/cutover gate, not assumed provable inside the running worker. The approval mechanism needs code/test design; no implied Production permission.
2. **D032-B (preferred): Rootless systemd timer**, `Unit=pa-dashboard-sync.service`, deployed disabled by default. A design suggestion is `08:00 Asia/Bangkok` with `RandomizedDelaySec=30m` and `Persistent=false`, all **unapproved**. Must inspect `Requires=pa-dashboard-migrate.service` so a timer cannot unexpectedly execute schema migrations.
3. **D032-C (preferred): Explicit fiscal publication gate.** Keep `app_settings` as configured target until independently authorized. Define **calendar FY**, **configured FY**, **published FY** and **source-ready FY** separately. Do not silently promote last year's data to FY2570.
4. **D032-D (preferred): Minimal freshness model first.** Preserve current public `sourceLastUpdated`/activation semantics. Provide operator-only per-source last valid marker, source count and missing/invalid markers via existing tables. An API extension/UI is a later optional approval, not a prerequisite.
5. **D032-E (required): Failure transparency.** A hard stop can leave `running`; completed persistence can leave `succeeded` but not activated if activation fails. Flag these for operator review instead of silently retrying or changing the active pointer.

## Known gaps / implementation probes

- Current MOPH `fetch` lacks explicit request timeout; transport catch/retry and per-source pacing exist. Verify expected MOPH latency in isolated tests before choosing job timeout.
- `moph-client.ts` validates nonempty object arrays but does not itself prove every row belongs to the approved district/FY or contains a valid update marker; source semantics need focused, non-destructive tests.
- The existing source freshness value is a **MAX across active source records**; one fresh source can mask stale or null `date_com` in others. Never claim whole-dataset freshness from that one value.
- Host Sync Quadlet references migrate service, which uses `RemainAfterExit=yes`; cold boot/restart behavior deserves a targeted test. No schema migration is authorized by this draft.
- Run lifecycle and lock already exist; preserve `sync_runs` audit and `app_state.active_sync_run_id` atomic activation, do not create a second scheduler that changes API/DB directly.

## Existing test harness and CI boundary

The repository already has `backend/test/sync-orchestrator.integration.test.ts`, `backend/test/sync-transport-config-lock.integration.test.ts`, and `backend/test/sync-transport-config-lock.unit.test.ts`. The integration harness explicitly checks for a PostgreSQL **major version 18** database with a name ending in `_test`; one suite also requires `PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES`, and it resets the public schema. Therefore **never run these suites against Production**.

The GitHub `.github/workflows/ci.yml` backend job runs the integration executables with `TEST_DATABASE_URL=""` and `PA_ALLOW_DESTRUCTIVE_DB_TESTS=""`, intentionally exercising their **skip/safety path** only. Existing green CI confirms source build/unit/static contracts, **not integration suite PASS**. Source code implementation requires a separately authorized isolated PostgreSQL 18 test environment and an independent review of its results.

## Scope and release disposition

**In 032:** safe target gate, bounded requests/interrupted-run handling, source-level freshness operator readout, explicit FY readiness, disabled timer source/templates, existing integration-test extensions.

**Separate backlog:** Prometheus/Grafana alert rules and delivery; multi-year public history selector; public write APIs; new KPI registry or calculation semantics.

**Gate:** source-only review PASS does not authorize implementation. Product Owner policy acceptance and code implementation approval required separately; main merge, OCI, Fedora runtime, timer activation and FY2570 activation are independent approvals.
