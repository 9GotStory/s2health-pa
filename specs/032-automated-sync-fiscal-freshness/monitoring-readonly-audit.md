# Feature 032 — T003 Prometheus Read-only Monitoring Probe

**Status:** draft, read-only operator evidence, no alert deployment authority.  
**Related:** [tasks.md](tasks.md), [host-evidence-2026-10-12.md](host-evidence-2026-10-12.md).

The running Prometheus/Grafana services and valid Prometheus config are already verified. **Scrape targets, effective Prometheus alert rules, Alertmanager destinations and Grafana contact routes are not yet established.**

## Operator command on Fedora (thanakorn)

This probes the existing **in-container loopback API** and prints **aggregate counts only**. It does not expose configured target URLs, raw metrics, rule expressions, contact endpoints or credentials. It does not create a container, open a port, install software, invoke Sync or modify host state.

~~~bash
(
  set -euo pipefail
  sudo -v
  cd /
  sudo -n -H -u websvc /bin/bash <<'WEBSVC'
set -euo pipefail
cd /
export XDG_RUNTIME_DIR=/run/user/1002
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1002/bus

echo "===== T003 PROMETHEUS EFFECTIVE STATE ====="
test "$(id -u)" -eq 1002
if ! command -v jq >/dev/null 2>&1; then
  echo "T003=BLOCKED_NO_JQ"; exit 0
fi
if ! podman container exists prometheus; then
  echo "T003=BLOCKED_NO_PROMETHEUS"; exit 0
fi

fetch_api() {
  local path="$1"
  if podman exec prometheus sh -c 'command -v wget >/dev/null 2>&1' 2>/dev/null; then
    podman exec prometheus wget -qO- "http://127.0.0.1:9090${path}"
  elif podman exec prometheus sh -c 'command -v curl >/dev/null 2>&1' 2>/dev/null; then
    podman exec prometheus curl -fsS "http://127.0.0.1:9090${path}"
  else
    return 127
  fi
}

summarize() {
  local label="$1" path="$2" filter="$3" json
  echo "SECTION=${label}"
  if ! json="$(fetch_api "$path" 2>/dev/null)"; then
    echo "${label}=API_CLIENT_MISSING_OR_UNAVAILABLE"
    return 0
  fi
  # Only the whitelisted aggregate fields are printed, never raw API JSON.
  if ! printf '%s\n' "$json" | jq -ce "$filter"; then
    echo "${label}=INVALID_OR_UNEXPECTED_RESPONSE"
  fi
}

summarize "PROM_RULES" "/api/v1/rules" '
  if .status=="success" and (.data.groups|type)=="array" then
    {status:"success",
     groups:(.data.groups|length),
     alerting:([.data.groups[]?.rules[]?|select(.type=="alerting")]|length),
     recording:([.data.groups[]?.rules[]?|select(.type=="recording")]|length)}
  else error("unexpected rules response") end'

summarize "PROM_TARGETS" "/api/v1/targets?state=active" '
  if .status=="success" and (.data.activeTargets|type)=="array" then
    {status:"success",
     total:(.data.activeTargets|length),
     up:([.data.activeTargets[]?|select(.health=="up")]|length),
     down:([.data.activeTargets[]?|select(.health=="down")]|length),
     unknown:([.data.activeTargets[]?|select(.health!="up" and .health!="down")]|length)}
  else error("unexpected targets response") end'

summarize "PROM_ALERTS" "/api/v1/alerts" '
  if .status=="success" and (.data.alerts|type)=="array" then
    {status:"success",active:(.data.alerts|length),
     firing:([.data.alerts[]?|select(.state=="firing")]|length)}
  else error("unexpected alerts response") end'

summarize "PROM_ALERTMANAGERS" "/api/v1/alertmanagers" '
  if .status=="success" and (.data.activeAlertmanagers|type)=="array" then
    {status:"success",
     active:(.data.activeAlertmanagers|length),
     dropped:((.data.droppedAlertmanagers // [])|length)}
  else error("unexpected alertmanagers response") end'

echo "T003_READ_ONLY=FINISHED"
echo "GRAFANA_CONTACTS_AND_DELIVERY=NOT_TESTED"
WEBSVC
)
~~~

## Review boundaries and interpretation

- If no wget/curl exists inside the existing Prometheus container, this script reports an unavailable API client. **Do not install a client, create a test container or publish port 9090** under this gate.
- Zero **Prometheus-managed** alert groups or Alertmanager endpoints does not exclude Grafana-managed alerts/contacts; Grafana and successful notification delivery need a separate, redacted review.
- Target health is a point-in-time observation and cannot prove PA-specific metric correctness.
- The output must not contain raw scrape URLs, labels, source records, confidential metrics, receiver tokens or full configuration files.
- T003 remains open until effective rules/target health plus the actual permitted Grafana/Alertmanager routing state are established. Any new alert rule or notification test requires its own approval.
