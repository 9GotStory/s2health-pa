# Feature 032 — T002/T003 Fedora Host Evidence (2026-10-12)

**Classification:** Operator-provided, redacted infrastructure metadata; no credentials or source patient records  
**Date/time of operator probe:** 2026-10-12 16:20 +07 (Asia/Bangkok)  
**Status:** **T002 PARTIAL PASS / T003 PARTIAL PASS** — incomplete; no implementation or production gate passed  
**Related:** [host-readonly-audit.md](host-readonly-audit.md), [tasks.md](tasks.md), [policy-proposals.md](policy-proposals.md), [PR #39](https://github.com/9GotStory/s2health-pa/pull/39)

## Verified host facts

| Probe | Observed result | Assessment |
| --- | --- | --- |
| Host, operator | 9gotstory-fedora; thanakorn | Context only |
| Host date/time | 2026-10-12T16:20:17+07:00 | Asia/Bangkok |
| Host timezone | Asia/Bangkok | PASS |
| Podman | 5.8.4 | Confirm version; compatibility tests still required |
| systemd | 259 (259.8-1.fc44) | Calendar parser available |
| User manager | websvc UID 1002; user bus socket previously checked | PASS for interactive inspection, long-running service reliability not proved |
| Login linger | Linger=yes; State=closing | NEEDS CHECK: is user@1002.service active and functioning after logout/reboot? |
| Candidate OnCalendar | '*-*-* 08:00:00 Asia/Bangkok' normalized; Oct 13 and Oct 14 elapses each at 08:00 +07 | Syntax PASS only; schedule is **unapproved** |
| Sync service | loaded / inactive / generated / Result=success; SourcePath to installed Quadlet | PASS for historical one-shot state |
| Named sync timer | pa-dashboard-sync.timer not-found/inactive | PASS for no **named** user timer |
| Other user timers | Two hash-named timers firing roughly every 10 seconds; two ordinary system timers | UNRESOLVED: attribute each hashed timer before claiming no alternate scheduler |
| Installed sync Quadlet file checksum | SHA-256: 36484f098ef4b74017861f23a964ca56e2456076f2cf78c6689510f8bec4789c | Recorded for future source-drift detection |
| Sync image reference | ghcr.io/9gotstory/pa-dashboard-api@sha256:3ac723826d793f7394dc00c8e65a9949ee3398a7e29b682410e08f5c4800b535 | Consistent with prior recovery evidence; not API/worker parity |
| Sync Exec | node dist/src/sync/run.js | One-shot runtime unchanged |
| Quadlet network | pa-dashboard-app.network | Unchanged |
| Running containers inventory | Attempt failed: cannot chdir to /home/thanakorn/Downloads (permission denied) | RETEST REQUIRED: working directory guard |
| systemd monitoring | grafana, prometheus, metrics collector and private exporter units loaded/active/running | Service-state PASS; not alerting readiness |
| Alert rules, contact points, scrape state | Not observed in this run | T003 remains OPEN |

## Findings / remediation scope

- **F032-H01 (medium): Working-directory leak into sudo-run user.** The operator executed sudo -u websvc while current directory belonged to another home. Rootless Podman could not chdir there. Add explicit cd / inside the websvc Bash process **before** any Podman command. This failure does not prove Podman runtime is broken.
- **F032-H02 (medium): Two unidentified transient/hash timers.** Query only unit metadata (Id, ActiveState, Transient, FragmentPath, SourcePath, Triggers); do not stop or restart timers. Their frequency suggests background periodic tasks but **purpose is unknown**.
- **F032-H03 (medium): loginctl State=closing with Linger=yes.** Query system-level user@1002.service ActiveState/SubState and user bus; do not infer that linger=enabled guarantees timer execution.
- **F032-H04 (medium): monitoring status ≠ alerting configured.** Verify actual Prometheus container and promtool configuration checks. After that, a separately approved read-only inspection of active rule groups, targets and alert routing/contact delivery is needed. No guess of metric names or URLs.
- **F032-H05 (high, preexisting): old worker OCI revision vs API OCI revision.** User-visible recovery succeeded, but recurring scheduling must have exact release image/contract review. No automatic worker ref replacement.
- **F032-H06 (high, policy): the configured 2569/Q4 year is historical** as of Oct 12 2026; do not install/enable a daily timer until separately authorized FY policy/target is approved and checked.

## Next operator read-only verification

Execute the following in a **new** shell on Fedora. No unit modification, no MOPH requests, no DB access, no credentials, no logs of protected payloads. The script intentionally starts with cd / inside the websvc login context and uses only metadata queries.

~~~bash
(
  set -euo pipefail
  echo "===== T002 USER MANAGER ====="
  systemctl show user@1002.service -p LoadState -p ActiveState -p SubState
  loginctl show-user websvc -p Linger -p State
  sudo -v
  cd /
  sudo -n -H -u websvc /bin/bash <<'WEBSVC'
set -euo pipefail
cd /
export XDG_RUNTIME_DIR=/run/user/1002
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1002/bus

echo "===== USER / PODMAN ====="
id -un
pwd
podman --version
podman ps -a --format '{{.Names}} | {{.Image}} | {{.Status}}' |
  grep -E '^(pa-dashboard-|prometheus|grafana)' || true

echo "===== ALL TIMER UNITS (FULL NAME) ====="
systemctl --user list-units --type=timer --all --no-legend --no-pager --full

echo "===== TIMER PROVENANCE METADATA ====="
while IFS= read -r timer; do
  test -n "$timer" || continue
  echo "TIMER=$timer"
  systemctl --user show "$timer" \
    -p Id -p ActiveState -p Transient \
    -p FragmentPath -p SourcePath -p Triggers
done < <(
  systemctl --user list-units \
    --type=timer --all --no-legend --no-pager --full --plain |
    awk 'NF > 0 {print $1}'
)

echo "===== PROMETHEUS CONFIG SYNTAX ====="
if podman container exists prometheus; then
  podman exec prometheus \
    promtool check config /etc/prometheus/prometheus.yml ||
    echo "PROMTOOL=CHECK_FAILED_OR_UNAVAILABLE"
else
  echo "PROMETHEUS_CONTAINER_NAMED_prometheus=NOT_FOUND"
fi

echo "===== T002_T003_READ_ONLY_RECHECK_END ====="
WEBSVC
)
~~~

Before sharing output, redact unintended secrets or URLs containing credentials. Do not share full environment files, raw MOPH data, unfiltered logs or monitoring rule contact secrets.

## Acceptance status

- T002: **not complete** until Podman inventory, long-lived user manager, hash timer provenance are verified.
- T003: **not complete** until monitoring config, actual rule/receiver/routes, and scrape health are assessed without secrets. This narrow follow-up only addresses config syntax and service metadata.
- T001: Product Owner policy remains **unapproved**.
- No operational permissions conveyed by this document; PR #39 stays draft/unmerged.
