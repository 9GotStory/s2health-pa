# Feature 032 — Lean Implementation Plan

**Status:** Draft; plan is not implementation or Production authorization  
**Baseline:** `9GotStory/s2health-pa` `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Inputs:** [spec.md](spec.md) · [research.md](research.md) · [tasks.md](tasks.md)

## Minimal target architecture

```text
disabled-by-default websvc systemd timer (after future enable approval)
                 |
                 v
existing pa-dashboard-sync.service (Quadlet one-shot)
                 |
      existing PostgreSQL advisory lock
                 |
       approved FY/Q/geography guard
                 |
        existing 18-source MOPH client
                 |
       source_records + KPI calculation
                 |
     succeeded + atomic app_state activation
                 |
 existing Fastify read API + GitHub Pages (Feature 031)
```

**No new persistent Sync worker, no replacement database, no new public write API.**

## Stage A — Sync safety first (future source-only implementation)

**Files likely involved:** `backend/src/sync/run.ts`, `config.ts`, `moph-client.ts`, `orchestrator.ts` and existing `backend/test/sync-*.test.ts`.

1. Preserve current source/definition identity and `app_state` publication transaction; insert the approved FY/Q/geography guard **under the existing advisory lock after configuration read and before a new run INSERT**. OCI source/digest parity is checked separately at release/cutover.
2. Add RED→GREEN tests for authorized/mismatched/missing policy, 18 valid vs 17 valid sources, empty source, malformed payload, source corrections, source-only KPI, explicit zero target, concurrency and active-run immutability on failure.
3. Add request timeout and bounded errors; handle interrupted `running` and unactivated `succeeded` states as operator-visible incidents with no blind auto-retry. No changes to previously applied migration SQL.
4. Re-run isolated PostgreSQL 18 integration tests and existing public read/API regression tests; **never use Production DB for development tests**.

**Gate A:** exact-SHA independent review + explicit implementation and merge approvals before any source can be released.

## Stage B — Fiscal readiness and freshness (future source-only implementation)

1. Define Thai fiscal calendar convention and explicit data-selection policy. Proposed FY2570/Q1 is a **candidate only**, not current Production configuration.
2. Add bounded, read-only source-readiness evaluator for FY2570, protecting the MOPH service from uncontrolled 18-source probing. Validate year, district/province and data completeness, with no source-payload logging.
3. First FY2570 dataset needs a **separate** human approval and healthy candidate before replacing active FY2569. No scheduler-driven `app_settings` update.
4. Expose operator-only `last_attempt`/`activatedAt`/per-source marker summary from existing records. Preserve public `sourceLastUpdated` and `activeSyncRunId` shape until a separate public contract decision.

**Gate B:** tests for missing FY2570 sources, unchanged data markers, mixed source freshness and preserved FY2569 public identity.

## Stage C — Timer source and host cutover (future approval)

1. Stage a new disabled rootless systemd timer targeting existing `pa-dashboard-sync.service`. Proposal only: daily 08:00 Asia/Bangkok + 0–30m jitter, `Persistent=false`; owner must accept or change schedule/missed-run policy.
2. Prove **`Requires=pa-dashboard-migrate.service`** does not trigger an unapproved migration at every schedule, restart or cold boot. Review actual unit dependencies, migration ledger and release/image digests. Do not suppress safety by removing migrations casually.
3. Verify timer calendar, no overlap, no start during render/CI, expected systemd timeout, handling of shutdown/reboot and no implicit `--enable`/`--now`; extend existing `infra/test/deployment-contract.test.mjs`.
4. Review exact OCI source SHA, digest and rollback file. Fedora inventory + backup/isolated restore + no-unapproved-diff + disabled timer installation are **separate** gates; first enablement is another independent approval.

**Gate C:** first authorized scheduled run must show one new `sync_runs` entry, 18/18 sources, approved fiscal identity, successful atomic activation and public dashboard/catalog run agreement. On failure, disable timer and investigate without blind retry.

## Explicitly deferred, not a dependency for source development

Further Prometheus/Grafana inventories, alert rule creation, contact points, routing and notification delivery tests. Existing Phase-0 operator evidence is enough to know services are running; operational Sync status and logs must remain inspectable before enabling any timer. A mature automated alerting solution can be a separate enhancement.

## T001 — Minimum Product Policy (ACCEPTED by Product Owner, 2026-10-12)

**Decision record:** Product Owner explicitly approved the T001 recommendations on 2026-10-12 (Asia/Bangkok). Approval applies to policy **for source design and T006 RED tests**, not implementation of production logic, PR merge, timer enablement, or a live fiscal-year change. Numeric 30-minute job ceiling is accepted **as a provisional test target**, not as a validated production timeout.

| Policy | Accepted v1 direction / bounded proposal | Test/guard |
| --- | --- | --- |
| Sync schedule | Once daily at 08:00 Asia/Bangkok, add 0–30 minute `RandomizedDelaySec` | Parse calendar under Fedora systemd 259; no unit enablement |
| Missed periods | `Persistent=false` initially; never create queued multi-run catch-up | Test disabled/reboot/resume semantics; no overlap or repeat loop |
| Request/job timeout | Bound each MOPH request and total worker execution; **30-minute job ceiling is a provisional review target**, not approved or latency-tested | Inject slow/hanging HTTP fixture and prove cancellation and previous active run preservation |
| FY2569 after FY boundary | Historical published dataset remains accessible, no unattended FY2569 resync | Fail closed on an expired configured target; exceptional one-shot backfill requires explicit authorization |
| FY2570 first dataset | Full 18-source readiness + separate owner authorization for FY/Q/area before any first publication | Missing/zero/mismatched FY data refuse activation; no calendar-only settings change |
| Operator freshness | Use existing run timestamps and per-source update markers; no public API/UI change initially | Distinct last attempted/succeeded/activated and source marker validation |
| Retry/crash | Only bounded transport retries; no automatic second Sync job after uncertain exit | Orphan `running` and succeeded-but-unactivated runs remain diagnosable, not silently promoted |
| Monitoring | Preserve existing journald and `/api/v1/sync-status` operational evidence; advanced alerts deferred | No Grafana/Prometheus implementation prerequisite |

**T001 policy decision: ACCEPTED**, with the 30-minute ceiling provisional pending tail-latency and cancellation evidence. **T006 RED test authoring is authorized** on a separate development branch, with the assistant acting as independent reviewer rather than sole test author. T007+ production-code implementation, documentation PR merge, release, timer and FY2570 activation remain separate gates. Accepted policy must not silently override Production `app_settings`.

### T006 readiness (test design only, not RED implementation)

The existing database test suite is at `backend/test/sync-orchestrator.integration.test.ts` and `backend/test/sync-transport-config-lock.integration.test.ts`. Its destructive guards require `TEST_DATABASE_URL` pointing to a database ending in `_test` and `PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES`. `.github/workflows/ci.yml` deliberately runs integration tests with no DB and those guards unset, so a green GitHub CI result **does not prove isolated PostgreSQL integration PASS**. A separate disposable PostgreSQL 18 test run is mandatory before any merge involving Sync logic.

RED cases for T006: authorized identity (year/quarter/province/district) allows reaching the first INSERT; absent/expired/mismatched scope rejects with zero new `sync_runs` rows, unchanged `app_settings` and unchanged `app_state.active_sync_run_id`; FY2570 wall-clock alone changes nothing; manual one-shot requires an explicit matching authority. Release digest attestation is a **host/OCI cutover verification**, not something to assume the process can cryptographically infer from an environment variable.

## Merge/production boundaries

- Docs-only PR #39 stays Draft until explicitly approved for merge; merging docs **does not** authorize implementation.
- Code PR needs separate acceptance; OCI publication, Fedora host cutover, timer install/enable and FY2570 first activation require independent approvals.
- At every gate compare exact SHAs, diff/CI, working images, Production API, `sync_runs` and backup/restore proofs.
