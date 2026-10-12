# Feature 032 — Automated Sync, Fiscal Year Management & Data Freshness

**Status:** DRAFT — Spec Kit Phase 0 / documentation-only; not approved for implementation or deployment  
**Created:** 2026-10-12 (Asia/Bangkok)  
**Source authority:** `9GotStory/s2health-pa` `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Tracking:** [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38)  
**Companions:** [research.md](research.md), [plan.md](plan.md), [tasks.md](tasks.md), [policy-proposals.md](policy-proposals.md)

## Problem and verified baseline

The public dashboard held Run #1 from September 28 because Production had a manual Quadlet one-shot `pa-dashboard-sync.service` but no PA scheduler. Human-approved one-shot recovery on October 12 produced active Run #2 (FY2569/Q4; 18/18 MOPH physical sources; 11,141 source rows; 3,004 KPI result rows; 47 public KPI definitions), with source marker `202610120606`. Configuration and OCI images were unchanged. The successful rescue is **historical evidence**, not a standing permission to schedule further production writes.

Current `app_settings.current_year=` `2569`, `current_quarter=4`; FY2570 started October 1, 2026, but direct OpenData probe for FY2570 returned zero rows for `s_dm_screen` and `s_epi1`. No assumption may be made about readiness of the remaining 16 sources.

## User stories and independently verifiable acceptance

1. **Operator / reliable refresh:** Once deployed and separately enabled, one scheduled job starts only the authorized target scope, records its run identity/outcome and never overlaps a manual or scheduled run. A missed/failed cycle is visible to operators; a failure never substitutes an incomplete active dataset.
2. **Public reader / trustworthy dates:** The dashboard distinguishes the time the system activated its last successful sync, the source-supplied update marker, and the fiscal year/quarter actually shown. No unverified claim that source data are fresh merely because a job succeeded.
3. **Data steward / FY boundary:** FY2569 remains preserved and identified as historical. Starting FY2570 requires source-readiness proof and a separate human-controlled activation/configuration gate; no calendar-only rollover or cross-year partial data.
4. **Operator / diagnosability:** Last attempt status, last successful activation, staleness, service exit outcome and source-specific freshness can be inspected without exposing raw source rows, secrets, patient data or internal host topology.
5. **Reviewer / safe release:** Exact-SHA code, CI/integration proofs, OCI digest parity and independent review precede any approved host cutover; timer enablement is an additional explicit gate.

## Functional requirements

- **FR-001 — Schedule:** Provide a configurable `websvc` rootless systemd **timer** for the existing one-shot Quadlet unit. No Cron, second sync engine, persistent worker or external scheduler. Source templates may be authored and tested in isolation; **do not install or enable** in Phase 0.
- **FR-002 — Fail-closed target identity:** A scheduled attempt must resolve the permitted FY/quarter/province/district and expected image revision before making writes. A missing, mismatched, or unapproved FY target prevents invocation/activation and is observable. Do not silently overwrite `app_settings`.
- **FR-003 — Concurrency and retries:** Preserve PostgreSQL advisory lock (single writer). Prevent duplicate invocation across manual/timer service requests, avoid unbounded retries/restart loops, document systemd calendar catch-up, and set an explicit job deadline/watchdog and interrupted-run investigation policy. Do not automatically retry potentially activated work.
- **FR-004 — Source completeness:** Each eligible candidate must contain 18 distinct, non-empty physical sources, expected district/province/year scope, valid row shape/date metadata and KPI semantic checks before activation. Source-only definitions remain source-only and public catalog remains 47 KPIs. A source count change is **not** alone an error.
- **FR-005 — Atomic publication:** Preserve immutable per-run source records/KPI results and atomic `app_state.active_sync_run_id` transition; failed or partial runs do not change the active pointer. Feature 031 dashboard/catalog run identity and bounded refetch stay unchanged.
- **FR-006 — Fiscal policy:** Define explicit FY/Q selection, the Thailand FY boundary (Oct 1), and observed OpenData availability as **different concepts**. No automatic FY2570 activation without 18-source readiness proof and Product Owner approval. Historical FY2569 must remain identifiable; multi-FY browsing is a **separate design decision** requiring API/UI schema and privacy review.
- **FR-007 — Freshness semantics:** Store/derive **last attempt**, **last successful activation**, **source update marker per physical source** and **dataset FY/Q**, without confusing `MAX(date_com)` with whole-dataset freshness. Accept both 12- and 14-digit `date_com` formats, validate calendar values and specify timezone provenance; avoid inventing timezone when MOPH does not provide one.
- **FR-008 — Alerting:** Reuse existing Prometheus/Grafana plumbing. Alert on overdue/failed sync, uninterrupted `running` state, incomplete source coverage and independently configurable stale source data. Alert rules/receivers and host installation require a separate gate; no raw payloads in metrics.
- **FR-009 — API/UI boundaries:** Prefer backward-compatible metadata extension with `syncRunId` and explicit field naming. Public fields must be aggregate-only; no new public administrative sync endpoint. Existing dashboard/KPI catalog/client contracts continue to work until explicitly versioned rollout.
- **FR-010 — Operability:** Provide disable/re-enable, evidence capture, manual override, rollback and incident runbook. Keep existing `pa-dashboard-*` unit names, network, `127.0.0.1:13001` loopback ingress, DB volume, and immutable digest policy. Use no `podman auto-update`.
- **FR-011 — Privacy/security:** Logs must not print raw MOPH payloads, credentials or health identifiers. Secrets remain external to Git; restrict write privileges to rootless service account. Public UI must not expose internal ports or mutable operations.
- **FR-012 — Change authority:** Separate gates for specification acceptance, implementation, main merge, Pages deployment when relevant, OCI publication, Fedora cutover, timer enablement and FY rollover. No standing authorization.

## Scenarios (Given / When / Then)

- **S01:** Given active Run #2 FY2569, when a new 18/18 candidate succeeds and quality gates pass, then exactly one new run becomes active, API dashboard and catalog carry the same new run ID, and FY remains approved FY.
- **S02:** Given one MOPH source returns zero rows/invalid shape/network error, when the timer invokes the job, then the candidate does not activate; active data and public KPI remain usable, while the attempt is recorded and an alert is possible.
- **S03:** Given two concurrent scheduled/manual starts, when the second attempts the advisory lock, then only one can mutate the dataset; the other exits without a competing activation.
- **S04:** Given October 1 arrives and FY2570 sources are empty/incomplete, when timer fires, then no FY2570 active dataset is created and the UI labels the current active data honestly as FY2569 rather than silently upgrading labels.
- **S05:** Given all sources are reachable but `date_com` has not advanced, when sync succeeds, then synchronization success and source freshness are reported separately; operators receive a policy-based freshness warning instead of fabricated recency.
- **S06:** Given an in-flight job is killed/reboots, then its run status and active pointer are reconciled safely; the next run cannot bypass unresolved state by blind retry.
- **S07:** Given an API activation races separate frontend requests, then Feature 031 bounded cross-run reload either yields a coherent dashboard/catalog pair or an explicit load error.
- **S08:** Given a timer installation/cutover image differs from reviewed release SHA, then deployment fails closed with no enabled timer.
- **S09:** Given an operator disables the timer, then existing active data remain queryable and manual recovery requires separately granted authority.

## Nonfunctional acceptance

- Operate with PostgreSQL 18, Node.js 24, Fedora rootless Podman + Quadlet/systemd and existing observability platform.
- No added public write surface, production secrets in logs, destructive integration tests on live DB, or unapproved schema migration.
- Tests: isolated PostgreSQL integration for lifecycle and crash/concurrency; deterministic clock/timezone/fiscal fixtures; source malformed/empty/partial fixtures; systemd/Quadlet template static tests; frontend contract regression; API/OCI provenance/rollback smoke.
- CI-only simulations do not authorize a Production Sync or a GitHub Pages deployment.

## Out of scope for Phase 0

Production mutations; timer install/enable/start; one-shot sync repeats; switching `app_settings` to FY2570; OCI image or DB-schema cutover; new FY picker/history UI; refactoring KPI math; new monitoring stack; patient-level data.

## Unresolved product decisions

1. Initial daily schedule (proposal: 08:00 Asia/Bangkok with bounded jitter); permitted operating window and MOPH load considerations.
2. Overdue attempt threshold and per-source freshness thresholds (proposed configurable, not hard-coded).
3. FY2570 read-only readiness probe cadence and who authorizes the first FY2570 activation.
4. Need for public status badges or FY history selectors; this may require a separate follow-on feature.
5. Policy for interrupted `running` sync runs and retention of historical raw source payloads.

**Decision gate:** Review [policy-proposals.md](policy-proposals.md) and the staged [tasks.md](tasks.md); Product Owner must accept the specification and architecture review before any implementation task is authorized.
