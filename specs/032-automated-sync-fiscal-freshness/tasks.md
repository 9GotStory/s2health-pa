# Feature 032 — Task Breakdown (Draft, NOT implementation authority)

**Status:** P0 planning only / proposed implementation order. **No task below is authorized to mutate Production.**  
**Source:** `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Branch:** `032-automated-sync-fiscal-freshness` / [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38) / [Draft PR #39](https://github.com/9GotStory/s2health-pa/pull/39)  
**Inputs:** [spec.md](spec.md), [research.md](research.md), [plan.md](plan.md), [policy-proposals.md](policy-proposals.md), [host-readonly-audit.md](host-readonly-audit.md)

## Working rules

- All unchecked task IDs below are **planned**, not started or assigned. **No standing authorization.**
- Implementation will require a separate Product Owner approval, plus an updated exact-SHA baseline. Do not infer that a merged design document authorizes production write operations.
- Work only in `9GotStory/s2health-pa`; avoid new development in `9GotStory/pa-dashboard`. Preserve byte-identical historical migrations, public KPI contract, Feature 031 cross-run consistency and prior service names.
- One independent reviewer (this assistant), implementation author separated as agreed in the project workflow; do not reintroduce `codex-lead-reviewer` or `claude-developer`.
- Never run tests requiring PostgreSQL write access against Production; use disposable PostgreSQL 18 for integration testing.
- The last approved Production run is **#2**, FY2569/Q4, 18/18 sources, 11,141 source records, 3,004 KPI result records, source marker `202610120606`. Treat as **historical observation**, not immutable forecast or current-state proof in a later release.

## P0 — Product decisions and evidence (design-only, no host writes)

- [ ] **T001 / Gate P0-A:** Approve/finalize [policy-proposals.md](policy-proposals.md): daily time/timezone/jitter, service deadline, missed-run handling, FY2569 freeze/backfill policy, first FY2570 gate, overdue/stale-source alert thresholds, retention and public UI scope. **Block all implementation if unresolved**.
- [ ] **T002 / Gate P0-B:** Run the read-only [Fedora evidence procedure](host-readonly-audit.md) to establish actual systemd/Podman versions, host timezone, rootless user manager, Quadlet source fingerprint and current timer inventory. Inspect journald retention separately if needed, without dumping payloads. Close only on observed/redacted host evidence; no service restart.
- [ ] **T003 / Gate P0-C:** Run the read-only [monitoring baseline procedure](host-readonly-audit.md) for unit/container state and Prometheus config validation. Active rules, receiver routing and scrape health require a **separate**, redacted read-only inventory based on actual accessible endpoints. Do not assume metric names, receivers or alert routes.
- [ ] **T004 / Gate P0-D:** Check FY2570 OpenData **read-only** across the 18 physical source definitions *only if source load/rate limits allow*; use limited deliberate sampling first. Record source shape, last update and data year, not raw patient records.
- [ ] **T005 / Gate P0-E:** Independent exact-SHA review of Spec Kit docs, drift from `main`, permissions, and product decisions; mark design approved only after Human acceptance. Main merge requires its own separate approval.

## P1 — Safety guard and sync lifecycle (implementation gate required)

- [ ] **T006 [T001,T005]:** Add RED unit tests for approved-target guard: explicit FY/Q/province/district; missing/mismatched approval; no implicit `app_settings` mutation; robust selection of active dataset identity.
- [ ] **T007 [T006]:** Implement the smallest runtime target-policy guard before the worker opens a writing sync run. Make authorized scope explicit, independently testable and fail-closed. No secrets in logs.
- [ ] **T008 [T007]:** Verify and preserve existing PostgreSQL advisory lock and atomic activation; add concurrency RED/GREEN integration scenarios including simultaneous manual/timer attempts.
- [ ] **T009 [T007]:** Add source payload validation tests: 18 sources, nonempty arrays, geographic/year evidence, malformed JSON, duplicate physical source, decreasing row counts; design criteria must not reject valid upstream corrections.
- [ ] **T010 [T009]:** Implement source semantic validations with documented tolerances. Preserve `kpi_results` contract, 52 registry definitions/18 physical/34 virtual/5 source-only and 47 public KPI entries.
- [ ] **T011 [T008,T010]:** Add crash/timeout tests where the service dies after run creation and after KPI completion but before activation. Orphaned `running` records must be detectable; no automatic success, pointer rollback or blind retry.
- [ ] **T012 [T011]:** Implement auditable, operator-authorized recovery procedure for interrupted attempts; never silently overwrite old evidence. No schema modification without separate SQL review.
- [ ] **T013 [T006-T012]:** Disposable PostgreSQL 18 integration suite: success, 17/18 failure, duplicate lock rejection, stopped worker, atomic run pointer, backward-compatible API/KPI contract and failure alerts. Require PASS before scheduler packaging.

## P2 — Timer packaging and host boundary (source implementation gate required)

- [ ] **T014 [T001,T013]:** Add timer **template**, not installed unit: `Unit=pa-dashboard-sync.service`, explicit reviewable `OnCalendar`, jitter and timeout policy. Proposed `Persistent=false` until operator approves missed-run catch-up policy.
- [ ] **T015 [T014]:** Extend staging-only renderer and static contract tests: timer target identity, compatible service type, no `Restart=always`, no automatic enablement/host install, immutable OCI digest, `websvc` isolation, no `--delete`.
- [ ] **T016 [T015]:** Test `systemd-analyze calendar` and unit verification on compatible Fedora/systemd test host, plus missed-run/suspend semantics and DST/UTC presentation if applicable. Verify `Persistent=false` does **not** imply no wake-from-suspend handling.
- [ ] **T017 [T016]:** Document operator runbook: timer disabled by default, inspect next trigger, disable action, journal/status capture, on-failure manual gate and backup/restore rollback procedure.
- [ ] **T018 [T015]:** OCI provenance test across API/worker/migrate entrypoints and source revisions; identify release artifact, exact image digest and migration ledger compatibility. **No GHCR publication or host cutover here.**

## P3 — FY readiness, freshness and observability (implementation gate required)

- [ ] **T019 [T001,T013]:** Add deterministic fiscal-calendar tests (Thai FY starts Oct 1, but configured FY and published FY stay explicit); no automatic switch merely from wall clock.
- [ ] **T020 [T019]:** Implement read-only FY readiness evaluator for 18 physical sources, with rate limit, bounded failure, freshness evidence and no saved patient payloads. A sample of two empty FY2570 sources must not be treated as a full FY readiness census.
- [ ] **T021 [T019,T020]:** Implement explicit operator-controlled first-FY2570 activation gate. Do not change `app_settings` as part of a calendar event; leave active FY2569 labeled FY2569 if FY2570 is unavailable.
- [ ] **T022 [T001]:** RED tests for `date_com`: 12- and 14-digit values, invalid calendar, no timezone provenance, stable marker, distinct source freshness, global max hiding stale sources.
- [ ] **T023 [T022]:** Add read-only operator freshness/status model: last attempt vs last succeeded/activated vs oldest/newest per-source input. Do not conflate service success with fresh source data.
- [ ] **T024 [T023]:** If public exposure is explicitly approved, extend aggregate-only, backwards-compatible API response and frontend text/tests; include Feature 031 same-`syncRunId` gate. Otherwise keep ops-only.
- [ ] **T025 [T003,T023]:** Build and test Prometheus/Grafana rule configuration **only against verified actual metric names and alert receiver policies**, with alerts for overdue sync, fail, orphan running, invalid source completeness, and stale source marker; no patient/credential data.
- [ ] **T026 [T019-T025]:** Comprehensive regression: fiscal run IDs, KPI target snapshot/explicit zero, raw counts, source-only, reference mappings, API CORS, no secret exposure, frontend without changes and (if changed) Browser UAT.

## P4 — Independently authorized delivery gates (DO NOT run by default)

- [ ] **T027 [T013,T018,T026]:** Independent review exact code SHA, CI/security results, SQL schema and release diff; Product Owner implementation acceptance before main merge.
- [ ] **T028 [T027]:** Separate approval: PR merge to `main`, with GitHub Pages deployment impact review if frontend build inputs changed.
- [ ] **T029 [T028]:** Separate approval: GHCR OCI publication, immutable SHA/tag and digest inspection; do not deploy by publishing.
- [ ] **T030 [T029]:** Separate approval: Fedora staged Quadlet changes, fresh backup+isolated restore, migration ledger, rollback image digest, network/volume mapping and runtime service cutover. Timer must remain **disabled**.
- [ ] **T031 [T030]:** Separate approval: timer **enablement**, after verified authorized FY target, complete sources, monitoring/receivers and current Prod status. Observe first scheduled run and public Active Run/KPI Catalog coherence; disable timer if issues occur.
- [ ] **T032 [T020,T021,T031]:** **Additional independent authorization for FY2570** readiness/config switch/first activation. Verify active run and public fiscal labels with fresh evidence.
- [ ] **T033 [T031,T032]:** Postdeploy smoke, monitoring observation, retention/rollback documentation, issue/PR audit evidence and final handoff.

## Cross-cutting safety acceptance

A deployment must **fail closed before writes** on wrong approved FY/Q/scope, wrong reviewed OCI digest or missing host-approval artifact; after a job starts, failure must **not activate** partial/corrupt data. A post-run `systemctl` success is not proof of a correct active dataset. Check PostgreSQL run counters and read API identities.

**No code, timer, Production configuration or public API contract change is authorized by this task list.**
