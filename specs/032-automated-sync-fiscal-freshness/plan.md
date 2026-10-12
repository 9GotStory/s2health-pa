# Feature 032 — Implementation Plan and Approval Gates

**Status:** DRAFT — Architecture / Spec Kit plan only (no development authority)  
**Source:** `9GotStory/s2health-pa` `main@8890e7bb087ae955252b074178860f113a45ca17`  
**Related:** [spec.md](spec.md), [research.md](research.md), [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38)

## Target design

```text
                          (after explicit enable approval only)
systemd --user .timer [websvc / Asia-Bangkok / jitter / maintenance policy]
         |
         v
pa-dashboard-sync.service (rootless Podman Quadlet; reviewed OCI digest)
         |
         | preflight: approved FY/Q, image parity, environment, deadline
         v
PostgreSQL session advisory lock (existing)
         |
         v
MOPH OpenData HTTPS 18-source fetch -> isolated sync_runs + source_records
         |
         v
KPI calculation & integrity gates -> kpi_results
         |
   if all pass
         v
atomic app_state.active_sync_run_id -> Fastify read API -> GitHub Pages
         |
         +----> audit / per-source freshness / existing Prometheus + Grafana
```

**Non-destructive design rule:** Never assume an automated calendar event is authority to update `app_settings`, activate a new FY, run migrations or install a new image. The existing public page remains on its last valid active run when candidate sync fails.

## Stage P0 — Specification and architecture (this branch)

**Deliverables:** `spec.md`, `research.md`, `plan.md`, draft `tasks.md`, `policy-proposals.md`, and the read-only T002/T003 [host audit](host-readonly-audit.md). Validate source facts, alternatives, privacy boundary, operational risks, operator decisions and testable acceptance. Do **not** create a running timer, start a sync, modify production configuration, or publish OCI images.

**Exit gate:** Independent exact-SHA documentation-only review, draft PR, explicit Product Owner acceptance of scope and unresolved product policy. The draft `tasks.md` is non-executable and intentionally remains blocked until policy decisions are accepted.

## Stage P1 — Core sync safety and test harness (future approval)

- Create deterministic fixtures for all 18 source names, including source-only 5 definitions and 47 exposed KPIs.
- Add preflight for approved FY/Q (explicit operator policy), geographic scope and semantic source validation. Preserve `source_records`, `kpi_results`, existing advisory lock and atomic activation.
- Handle bounded transport failures, empty sources, malformed `date_com`, image provenance and post-run status.
- Define terminated-job (`running` orphan) behavior. Reconciliation must be safe, auditable and not infer that partial rows can be activated.
- Write disposable PostgreSQL 18 integration tests for success, partial 17/18, lock contention, crash/restart, activation refusal and count changes; no live DB tests.

**P1 acceptance:** all tests pass; no KPI semantic regressions; correct run identity; failed source/unsafe FY never activate.

## Stage P2 — Scheduler/operations source (future approval)

- Add `infra/quadlet/pa-dashboard-sync.timer.in` or a reviewed equivalent user timer template; schedule configurable in operator input, not silently hardcoded to live host.
- Timer points only to exact approved `pa-dashboard-sync.service`; `websvc` rootless user scope; no Cron/GitHub Actions external callback.
- Validate correct timezone, persistent catch-up policy, randomized delay, bounded job lifetime, journal outcome and retry/no-overlap behavior.
- Update staging-only renderer and `infra/test/deployment-contract.test.mjs` to assert **no installation, no enablement, no start** during CI/source generation. Test exactly which host files would change; never `--delete` production Quadlet directory.
- Coordinate API, migration and sync image revisions as one reviewed source release; no implicit runtime cutover.

**P2 acceptance:** unit template passes static/systemd verification in isolated scope; timer disabled by default until separately authorized.

## Stage P3 — Fiscal readiness and freshness (future approval)

- Implement explicit fiscal policy/config: year/quarter/province/district tied to an approved target, with FY change behind operator approval and 18-source readiness proof.
- Define read-only source probe for FY2570; do not write candidate source payloads as active unless complete and separately authorized. Avoid ongoing FY2569 scheduled writes after rollover without approved historical backfill policy.
- Publish operator-level last attempt/last successful activation/per-source freshness, with original marker and timezone provenance. Do not mislabel `MAX(date_com)` as all-sources freshness.
- Extend aggregate-only API/UI only if the Product Owner accepts public metadata contract; preserve Feature 031 `syncRunId` cohesion and bounded reload.
- Add threshold policy and observability using existing Prometheus/Grafana: overdue sync, failed job, orphan running, incomplete sources, stale per-source input. Verify real exporter names and alert receivers before rules are authored.

**P3 acceptance:** FY2570 missing/empty data leaves FY2569 active and honestly labeled; last attempt vs source age vs activation are distinct; no private data leakage.

## Stage P4 — Release preparation (future separate approvals)

1. Review `main` exact SHA and PR diff; code + integration CI, lint, coverage, security audit, SQL migration compatibility, public contract and frontend regressions.
2. Request explicit Product Owner approval to merge code. Docs-only PR approval does not authorize feature code merge.
3. Verify OCI image digest and source revision for API/sync/migrate; request separate OCI publication and Fedora cutover approval. Record the old digest for rollback.
4. Run Production read-only inventory, fresh `pg_dump -Fc`, independent isolated restore, settings/year check, backup checksum and source readiness. **No automated data write** yet.
5. Stage candidate Quadlet/timer files outside installed directory and show exact diff; dry-run systemd timer calendar; first install behind an explicit host authorization.
6. Commission with timer **disabled**, verify no unexpected start and production API health; separate approval to enable.
7. Verify first scheduled attempt: fresh run record, 18/18 sources, expected FY/Q, valid KPI output and cross-run public read contract. On failure disable timer and investigate without blind retry.
8. Apply FY2570 policy only after Product Owner approves source readiness and first FY activation. Log exact SQL/migration/host events; keep rollback/disable instructions.

## Verification matrix

| Test ID | Condition | Expected |
| --- | --- | --- |
| T032-01 | Success on authorized year/quarter | 18/18, succeeded, atomic pointer moved, coherent dashboard/catalog |
| T032-02 | One source empty, 429/500 or malformed JSON | failed/no activation; active pointer stable |
| T032-03 | Source counts decrease after upstream correction | accepted if structural/semantic validation passes |
| T032-04 | Two attempts overlap | one lock holder; no competing active pointer |
| T032-05 | Worker killed after `running` insert | orphan observable, not auto-activated or silently retried |
| T032-06 | FY rollover with FY2570 missing | fail-closed / explicit waiting state; FY2569 correctly labeled |
| T032-07 | `date_com` 12-digit, 14-digit, malformed, unchanged | faithful time semantics, source-specific diagnosis |
| T032-08 | API datasets swap between GET requests | Feature 031 consistent reload or visible failure |
| T032-09 | Timer default state after source build/install dry-run | not started, not enabled; immutable service target |
| T032-10 | Wrong OCI digest/target FY | preflight rejects; no Production data write |
| T032-11 | Monitoring disabled, exporter absent or unexpected metrics | degrade visibly; never invent reliable alerting |
| T032-12 | Public metadata request | no raw payload, patient identifiers, credentials or internal socket/host leakage |

## Interfaces / expected file impact (proposed, not authorized)

- `backend/src/sync/config.ts`, `backend/src/sync/orchestrator.ts`, `backend/src/sync/run.ts`, `backend/src/sync/moph-client.ts` and new safety modules/tests: validate targets and recoverability.
- `backend/src/modules/read-api.ts` and tests: aggregate-only status/freshness, if approved.
- `infra/quadlet/pa-dashboard-sync.container.in` and new timer template, `infra/render-quadlets.mjs`, `infra/test/deployment-contract.test.mjs`: explicit disabled-by-default scheduler packaging.
- `src/lib/*` or UI only if separate API/status UX decision authorizes it.
- `docs/system/*`, `infra/README.md`: contract, runbook, monitoring and test evidence, updated after code acceptance.
- Migration SQL **only if proved necessary**; no changes to immutable historical migrations.

## Gate checklist / stop conditions

- [x] Recovery baseline established (active Run #2 FY2569/Q4).
- [x] Direct FY2569 OpenData 18-source probe passed; FY2570 probe **incomplete** (2 samples empty).
- [x] Fresh backup + isolated restore + cleanup succeeded for prior one-shot recovery.
- [x] Architecture risk register drafted.
- [ ] Schedule + freshness thresholds + historical backfill + FY2570 operator policy accepted (see [policy-proposals.md](policy-proposals.md) and gate T001).
- [ ] Spec/architecture independently reviewed on exact docs commit; Product Owner approval.
- [ ] Implementation, CI, host, image and timer gates (all separate).

**STOP when:** year setting differs from approved target; unexpected active-run ID; other sync running; OCI revision/digest mismatch; incomplete source coverage; unavailable backup/restore proof; inconsistent public contracts; missing approval; unknown host diff. Do not re-run/recover automatically.

## Current verdict

**P0 source documentation only.** No implementation, no production timer, no registry/schema changes, no sync and no main merge are authorized by this draft.
