# Feature 032 — Fedora T002/T003 Read-only Host Evidence

**Status:** DRAFT — operator-run evidence collection only; **not** runtime authorization.  
**Date:** 2026-10-12 (Asia/Bangkok)  
**Tracking:** [Issue #38](https://github.com/9GotStory/s2health-pa/issues/38) / [Draft PR #39](https://github.com/9GotStory/s2health-pa/pull/39)  
**Related:** [tasks.md](tasks.md), [research.md](research.md), [policy-proposals.md](policy-proposals.md), [operator evidence 2026-10-12](host-evidence-2026-10-12.md)

## Purpose and trust boundary

T002 verifies the **real Fedora rootless runtime**, service/timer state, service-user linger, timer calendar parsing, and image provenance. T003 verifies **available monitoring infrastructure and configuration parsing**, without asserting that alerts have been deployed.

This is needed because the GitHub infra/ directory defines source templates, not the installed Fedora units. The successful FY2569/Q4 one-shot recovery created/activated Run #2; **do not re-run it**. The installed worker image historically differs from the running API image.

**Safe scope:** No restart, start/stop/enable, podman pull/run/create, database write, MOPH network request, Kubernetes/container update, file edit, or credentials display. Commands inspect unit metadata, container metadata and Prometheus configuration syntax. Run as thanakorn on Fedora with interactive sudo authentication. No local persistent file is required.

## Exact host command (read-only)

Run **once** in a normal Bash shell. The grouping avoids retaining shell traps/state.

~~~bash
(
  set -u

  echo "===== T002 USER/TIME ====="
  id -un
  id -u
  date --iso-8601=seconds
  echo "LOCAL_TIMEZONE=$(timedatectl show -p Timezone --value 2>/dev/null || echo UNKNOWN)"
  loginctl show-user websvc -p Linger -p State 2>/dev/null || echo "WEBSVC_LOGINCTL=UNKNOWN"
  podman --version || true
  systemctl --version | head -n 1

  echo "===== T002 CALENDAR SYNTAX (PROPOSAL, NOT APPROVED) ====="
  systemd-analyze calendar '*-*-* 08:00:00 Asia/Bangkok' --iterations=2 || \
    echo "CALENDAR_PARSE=NOT_VERIFIED"

  echo "===== T002 SERVICE-USER AUTHORITY ====="
  if ! sudo -v; then
    echo "SUDO=UNAVAILABLE"
    exit 1
  fi

  cd / || exit 1
  sudo -n -H -u websvc /bin/bash <<'WEBSVC'
set -u
cd /

export XDG_RUNTIME_DIR=/run/user/1002
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1002/bus

echo "WEBSVC_USERNAME=$(id -un)"
echo "WEBSVC_UID=$(id -u)"
echo "WEBSVC_PODMAN=$(podman --version 2>&1)"

echo "===== T002 SYNC SERVICE/TIMER ====="
for U in pa-dashboard-sync.service pa-dashboard-sync.timer; do
  echo "UNIT=$U"
  systemctl --user show "$U" \
    -p LoadState \
    -p ActiveState \
    -p UnitFileState \
    -p FragmentPath \
    -p SourcePath \
    -p Result \
    -p TimeoutStartUSec 2>&1 || \
    echo "UNIT_METADATA=UNAVAILABLE"
done

echo "===== T002 TIMER INVENTORY ====="
systemctl --user list-timers --all --no-pager --full 2>&1 || \
  echo "TIMER_LIST=UNAVAILABLE"

echo "===== T002 PA SERVICE UNIT INVENTORY ====="
systemctl --user list-unit-files --no-pager --full 2>&1 |
  grep -E '^(pa-dashboard-|UNIT FILE)' || true

echo "===== T002 INSTALLED SYNC SOURCE HASH ====="
if test -f "$HOME/.config/containers/systemd/pa-dashboard-sync.container"; then
  sha256sum "$HOME/.config/containers/systemd/pa-dashboard-sync.container"
else
  echo "SYNC_QUADLET_SOURCE=NOT_FOUND"
fi

echo "===== T003 CONTAINER STATUS / IMAGE SOURCE (NO ENV) ====="
for C in pa-dashboard-db pa-dashboard-api prometheus grafana \
         pa-dashboard-private-exporter pa-dashboard-metrics-collector; do
  echo "CONTAINER=$C"
  if podman container exists "$C"; then
    podman inspect "$C" --format \
      'status={{.State.Status}} image={{.ImageName}}' 2>&1 || \
      echo "CONTAINER_INSPECT=UNAVAILABLE"
  else
    echo "PRESENT=NO"
  fi
done

echo "===== T003 MONITORING UNITS ====="
for U in prometheus.service grafana.service \
         pa-dashboard-private-exporter.service \
         pa-dashboard-metrics-collector.service; do
  echo "UNIT=$U"
  systemctl --user show "$U" \
    -p LoadState -p ActiveState -p Result 2>&1 || \
    echo "UNIT_METADATA=UNAVAILABLE"
done

echo "===== T003 PROMETHEUS CONFIG CHECK ====="
if podman container exists prometheus; then
  podman exec prometheus promtool check config \
    /etc/prometheus/prometheus.yml 2>&1 || \
    echo "PROMTOOL=UNAVAILABLE_OR_CONFIG_INVALID"
else
  echo "PROMETHEUS_CONTAINER=NOT_FOUND"
fi

echo "===== T003 NO RULE/ALERT ASSUMPTION ====="
echo "CHECK_ONLY=Prometheus syntax; active rules/receivers not confirmed"
echo "WEBSVC_READ_ONLY_AUDIT=FINISHED"
WEBSVC

  echo "HOST_READ_ONLY_AUDIT=FINISHED"
)
~~~

## Safe evidence interpretation

- Sync service LoadState=loaded with ActiveState=inactive is **expected** for a completed one-shot. A blank ExecMainStartTimestamp does not prove absence of a run; PostgreSQL sync_runs and app_state remain authoritative.
- Sync timer LoadState=not-found only establishes this named user timer is absent. Inspect matching and hashed timers before excluding alternative scheduling.
- Promtool success validates **configuration syntax and rule-file loading**, not successful scrape, firing alerts or receiver delivery.
- Systemd-analyze calendar parses a **proposed** expression and does not enable a timer. OnCalendar is realtime and RandomizedDelaySec adds delay; AccuracySec can additionally coalesce expiry. Validate the eventual combination on the real Fedora systemd version. Official manuals: [systemd.timer(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [systemd.time(7)](https://www.freedesktop.org/software/systemd/man/latest/systemd.time.html).
- API and sync OCI image digests must not be changed by this diagnostic procedure.
- If outputs accidentally include tokens, credential-bearing URLs or raw patient/source rows: **redact before sharing**. Do not paste .env contents, private dashboard configuration or unfiltered metrics bodies.

## T003 evidence still required to close monitoring inventory

This procedure checks Prometheus config syntax but does **not** enumerate active alert rules, routing or successful scrape targets. Gather those only through a separately scoped **read-only and redacted** operator query after confirming actual permitted Prometheus/Grafana endpoints. Do not invent target URLs, rule names, metric family names or receivers.

| Item | Minimal evidence |
| --- | --- |
| Fedora/systemd/Podman | Exact versions and Asia/Bangkok calendar parse result |
| Rootless identity | websvc UID 1002, linger and user bus availability |
| Sync service/timer | Loaded/inactive after one-shot, named timer absent until approved |
| Image provenance | API and sync exact immutable digests as previously verified; no pull |
| Prometheus/Grafana | Container/service state, Prometheus config valid or error |
| Actual alert rules/receivers | **Unknown until separate inspection** |
| Production PostgreSQL | No queries/writes in this procedure; Run #2 is historical baseline |

## Observed 2026-10-12 host output

The operator-run initial audit is [recorded separately](host-evidence-2026-10-12.md). Core user/one-shot/timer/calendar metadata passed, but Podman inventory failed due to a forbidden inherited working directory. Two hashed timers have not been attributed; Prometheus active rules/receivers and user manager long-lived state have not been fully proven. The follow-up uses `cd /` before Podman. **T002/T003 remain PARTIAL PASS.**

## Status and stop conditions

**T002/T003 are NOT marked complete** by committing this document. Close only when real Fedora command output is independently reviewed and redacted. Fail closed on unexpected runtime owner, offline user manager, unexpected timer schedule or evidence of production drift. Do not edit host units or start synchronization.
