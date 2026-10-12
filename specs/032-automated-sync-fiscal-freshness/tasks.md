# Feature 032 — Focused Task List

**Status:** Draft, no implementation authority. Based on [spec.md](spec.md), [research.md](research.md) and [plan.md](plan.md).  
**Repository:** `9GotStory/s2health-pa`; base `main@8890e7bb087ae955252b074178860f113a45ca17`.  
**Rule:** Unchecked tasks are not started. Production sync, FY changes, OCI, host installs, timer enablement and main merge each require separate approval.

The original **T001–T033 IDs are preserved** for traceability, but work is regrouped under the three actual feature goals. Monitoring implementation is deferred.

## P0 — Design policy / baseline (documentation-only)

- [ ] **T001 — Owner policy:** Decide authorized Sync time/jitter/max deadline, missed-run policy, historical FY freeze/backfill, FY2570 first activation gate and operator-only freshness. See [plan.md](plan.md). A proposal is not acceptance.
- [x] **T002 — Fedora baseline:** Read-only operator evidence: systemd 259, Podman 5.8.4, `websvc` UID1002, running rootless manager, `Linger=yes`; Sync one-shot inactive and named timer absent; transient timers are Podman healthchecks.
- [x] **T003 — Monitoring boundary established, deep investigation DEFERRED:** Existing Prometheus/Grafana running; Prometheus 2/2 targets UP, managed alerting/recording rules=0, active external Alertmanagers=0; Grafana static provisioning alert files=0. This is **not** proof of alert delivery. More monitoring work is a separate backlog.
- [ ] **T004 — FY2570 source readiness:** Rate-limited **read-only** MOPH checks with counts/scope/date metadata only; two prior source samples returned empty. No DB writes or raw rows in evidence.
- [ ] **T005 — Design acceptance:** Exact-SHA independent review; obtain explicit Product Owner acceptance before authorizing code implementation. PR #39 remains Draft until separate merge approval.

## A — Safe existing Sync Engine (implementation gate required)

- [ ] **T006 — RED target-policy tests:** FY/Q/province/district and approved release identity missing, stale or conflicting → reject before creating a run.
- [ ] **T007 — GREEN preflight:** Enforce the policy before `createRunningSyncRun`; never alter `app_settings` on a timer tick.
- [ ] **T008 — Lock tests:** Existing PostgreSQL advisory lock stops concurrent manual/timer invocations; retain transactional active-run publication.
- [ ] **T009 — RED source tests:** 18 good sources; one empty/invalid/wrong FY/geography; row count correction; invalid dates.
- [ ] **T010 — GREEN source checks:** Preserve 18 physical, 34 virtual, 5 source-only and 47 public KPIs; no calculation/target regression.
- [ ] **T011 — Interrupted state tests:** Worker killed after running insert or between succeeded and active; fail safely and remain diagnosable.
- [ ] **T012 — Recovery procedure:** No blind retry or automatic promotion of orphan; operator-controlled resolution, auditable.
- [ ] **T013 — Disposable integration suite:** PostgreSQL 18, MOPH fixtures, API/dashboard/catalog same-run, timeout/abort and no-write-on-refusal.

## B — FY policy and freshness (implementation gate required)

- [ ] **T019 — FY calendar tests:** Oct 1 Thai FY rollover never silently changes configured or published FY.
- [ ] **T020 — Source readiness evaluator:** Bounded, read-only 18-source FY check; no patient/raw payload logs and no Production DB mutation.
- [ ] **T021 — First publication policy:** FY2570 activation requires explicit separate approval plus fresh complete source evidence.
- [ ] **T022 — Marker tests:** 12- and 14-digit `date_com`, invalid calendar values, unchanged and divergent per-source dates.
- [ ] **T023 — Operator freshness:** Report last attempt, last activated run and **per-source** marker/coverage distinctly; preserve existing public `sourceLastUpdated` field.
- [ ] **T024 — DEFERRED public UI/API extension:** Not required for v1; separate UX/contract/privacy approval if requested.
- [ ] **T025 — DEFERRED alerting deployment:** Prometheus/Grafana rules, receivers and notification delivery are **outside Feature 032's core implementation**.
- [ ] **T026 — Regression:** Existing KPI semantics and Feature 031 cross-run identity, source-only flags, raw-count and explicit zero targets.

## C — Timer source and independently gated release (implementation/release gates required)

- [ ] **T014 — Timer template:** Rootless user timer targeting `pa-dashboard-sync.service`, disabled/uninstalled in source-only CI; values from approved policy.
- [ ] **T015 — Renderer/contracts:** Test immutable image, correct calendar and service identity, no automatic start/enable, no production path replacement.
- [ ] **T016 — Timer behavior tests:** systemd 259 calendar/jitter/missed ticks, reboot and timeout; no hidden retries.
- [ ] **T017 — Operator runbook:** Evidence, disabling timer, inspecting failed runs and rollback with active dataset unchanged.
- [ ] **T018 — Image/migration dependency review:** Verify immutable worker/API/migrate source/digest compatibility and `Requires=pa-dashboard-migrate.service` execution safety. No unapproved migration.
- [ ] **T027 — Code independent review:** Exact SHA and clean disposable tests, security/scope and release provenance; obtain Product Owner approval.
- [ ] **T028 — Code merge:** Separate explicit main-merge approval; consider Pages trigger only if frontend inputs changed.
- [ ] **T029 — OCI publish:** Separate approval, exact GHCR digest and rollback reference. Publishing does not deploy.
- [ ] **T030 — Fedora staged cutover:** Separate backup + isolated restore, exact unit diff, migration ledger; install proposed timer **disabled** only after host approval.
- [ ] **T031 — Timer enablement:** Separate explicit authorization once a safe FY target and source readiness are proven; verify first scheduled run identity/results. Never enable while FY2569 remains unexpectedly configured after rollover.
- [ ] **T032 — FY2570 first activation:** Independent gate from timer; never automatically promote on calendar alone. Does **not** need to wait for timer enablement if an approved one-shot rollover is chosen.
- [ ] **T033 — Completion:** Postdeploy dashboard/catalog identity, data freshness labels, failure/rollback observation and docs/handoff.

## Stop conditions

- No approved target FY/Q/revision; incomplete/mismatched source data; active sync lock; orphan `running` run; unexpected migration execution; unreviewed OCI digest; missing backup/restore proof; or different Active Run/API identity.
- A failed Sync must **never** activate incomplete data, and a systemd success alone does not prove API correctness.
- A source-only Draft PR or accepted design **never grants standing Production authority**.
