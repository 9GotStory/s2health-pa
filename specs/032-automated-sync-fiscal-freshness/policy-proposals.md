# Feature 032 — Policy Proposals for Product Owner Review

**Status:** PROPOSALS ONLY; none approved or installed. **No standing permission to invoke sync.**  
**Date:** 2026-10-12 / Asia/Bangkok  
**Inputs:** [spec.md](spec.md), [research.md](research.md), [plan.md](plan.md), [tasks.md](tasks.md)

## Why a timer must NOT be enabled yet

Production was successfully recovered manually: active Run #2, FY2569/Q4. OpenData FY2570 returned **zero rows** for two sampled physical sources. The old Quadlet sync service reads `app_settings.current_year=2569` and `current_quarter=4`. Enabling a daily timer now would repeat FY2569 instead of proving FY2570 readiness, and could present historical-year data as if it had been refreshed for the current fiscal period. A configured-year guard is required before *any* recurring activation.

## Proposed defaults and approval decisions

| Policy | Proposed default | Why | State |
| --- | --- | --- | --- |
| P032-A Time | Daily at **08:00 Asia/Bangkok**, random delay **0–30 minutes** | After upstream night processing observed in previous probes; avoid synchronized load | **UNAPPROVED** |
| P032-B Missed runs | `Persistent=false` initially; no automated replay of missed calendar periods after timer disable/downtime | Prevent surprise recovery writes; note sleep/resume semantics still require tests | **UNAPPROVED** |
| P032-C Job budget | 30-minute maximum runtime as a provisional engineering bound; one invocation, bounded MOPH retry only, no `Restart=always` or automatic repeat | Bound a stuck job; must test 18-source tail latency under failure | **UNAPPROVED** |
| P032-D Approved target | Strict allowlist: configured FY/Q/province/district and reviewed OCI digest must match human-approved target. Default **no approved target** → no write | Avoid silent FY rollover / image skew | **UNAPPROVED** |
| P032-E FY transition | FY2570 first publication only after all 18 sources pass readiness and a separate Product Owner approval; **no auto-switch on Oct 1** | Two FY2570 probes were empty on Oct 12; 16 sources not probed | **UNAPPROVED** |
| P032-F Historical FY2569 | Keep historical active/published FY labeling truthful; **no recurring historical backfill by default** once the new FY begins. Explicit one-shot backfill exception only | Avoid automating out-of-year syncs, retain auditability | **UNAPPROVED** |
| P032-G Staleness of successful sync | Operational **warning** if last successful activation older than 36 hours, **critical** after 72 hours **only when schedule enabled and data production authorized**, maintenance-silence allowed | Daily job grace window; do not alert continuously while awaiting FY2570 | **UNAPPROVED** |
| P032-H Source freshness | Per-source thresholds **undetermined pending MOPH cadence evidence**; initially expose raw marker, age and source coverage, no blanket 24h failure | Upstream data may refresh at different cadences | **UNAPPROVED** |
| P032-I FY2570 readiness probe | Manual/read-only and bounded initially; automation cadence decided after provider load/rate and response semantics verified | Avoid extra upstream load and false alarms | **UNAPPROVED** |
| P032-J Public UI | Keep public API/UI unchanged in first scheduler release; operator-only freshness first. Public metadata extension separately authorized after privacy/API compatibility review | Minimize scope and production risk | **UNAPPROVED** |
| P032-K Retention | Keep audit `sync_runs`, currently active and recoverable prior dataset during first release; define raw data and run-history retention after volume growth/PDPA classification review | Raw payloads may require stricter handling than summary KPI | **UNAPPROVED** |
| P032-L Alert transport | Reuse Prometheus/Grafana but **do not select routing/receivers or write rule expressions until metric and contact inventory is verified** | Service health != available notifications | **UNAPPROVED** |

These are **design baselines for testing and discussion**, not a configuration commit. Human approval must explicitly cover the policy set or require changes. An approved specification is not permission to enable a production timer.

## Interpretation rules

1. **Calendar year vs Buddhist fiscal year vs configured year:** FY2570 begins 2026-10-01; a current calendar date of Oct 12 does not prove FY2570 MOPH source readiness. Current public data is FY2569/Q4 unless an approved future run replaces it.
2. **Successful sync vs current source data:** A `succeeded` run means processing/activation completed. Source freshness is measured separately. Dataset `sourceLastUpdated` currently represents a global **maximum**, not that all 18 sources are equally fresh.
3. **Source timestamps:** `date_com` values like `202610120606` and `20261011221713` lack an explicit timezone; do not add a timezone assumption. Validate actual calendar values rather than numeric length alone.
4. **No retry on unknown outcomes:** If `systemctl start` times out, fails, or the operator loses the terminal, query `sync_runs` and `app_state` before deciding whether another invocation can run. Do not auto-activate orphan records.
5. **Server/human boundaries:** Timer templates may be tested in a disposable environment. Fedora rootless runtime owner is `websvc`; no host install or activation before separate approval; `main` merges are separately authorized.
6. **Accessibility:** Proposed public date/status messages should use existing UI text/icon patterns, never color alone or misleading green badges for stale FY.

## Acceptance checklist for policy gate T001

- [ ] The Product Owner approves schedule + timezone + randomized delay + maximum runtime.
- [ ] The Product Owner accepts no catch-up and no automatic repeat, or specifies alternative.
- [ ] The Product Owner specifies whether any recurring FY2569 backfill is desired (default no).
- [ ] The Product Owner defines who and what evidence can approve FY2570 first activation.
- [ ] Operator confirms actual MOPH refresh cadences or agrees to visibility-only per-source freshness in v1.
- [ ] Owner approves warning/critical schedules and desired maintenance silencing/receiver destination.
- [ ] Owner accepts operator-only v1 status and separately scoped public status UI.
- [ ] Owner approves raw source/audit retention policy after privacy and storage assessment.

**Decision Gate:** Until reviewed, the plan and tasks remain conditional; no production timer should be enabled.
