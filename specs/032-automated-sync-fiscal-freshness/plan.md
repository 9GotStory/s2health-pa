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
           approved target/image guard
                 |
      existing PostgreSQL advisory lock
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

1. Preserve current source/definition identity and `app_state` publication transaction; identify exact pre-INSERT point for a fail-closed approved FY/Q/geography and release guard.
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

## Product decisions (not yet approved)

| Decision | Proposal, not default |
| --- | --- |
| Schedule | Daily 08:00 Asia/Bangkok with up to 30 min jitter |
| Catch-up | `Persistent=false` initially, test resume/reboot semantics |
| Hard timeout | Derive from real 18-source retry bound; **30 minutes is provisional**, not proven |
| Historical FY2569 | No unattended historic-year re-sync after rollover; explicit manual backfill authorization only |
| FY2570 | Require rate-limited source-readiness evidence and first activation approval |
| Freshness | Operator-only first; per-source marker coverage and age rather than global `MAX(date_com)` |
| Public UI | No new UI/API features in the first Sync scheduler release |

## Merge/production boundaries

- Docs-only PR #39 stays Draft until explicitly approved for merge; merging docs **does not** authorize implementation.
- Code PR needs separate acceptance; OCI publication, Fedora host cutover, timer install/enable and FY2570 first activation require independent approvals.
- At every gate compare exact SHAs, diff/CI, working images, Production API, `sync_runs` and backup/restore proofs.
