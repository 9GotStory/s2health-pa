# Feature 032 — T003 Grafana Alerting and PA Metric Coverage Review

**Status:** operator-run read-only audit / Phase 0 only  
**Evidence before this check:** Prometheus live API on 2026-10-12 16:47 +07: 2 active scrape targets; 2 UP; 0 DOWN; 0 managed recording/alerting rule groups; 0 active external Alertmanagers. Grafana-managed alerting remains unknown.  
**Related:** [host-evidence-2026-10-12.md](host-evidence-2026-10-12.md), [monitoring-readonly-audit.md](monitoring-readonly-audit.md), [tasks.md](tasks.md).

## 1. Non-mutating Grafana provisioning inspection

Run as \`thanakorn\` on Fedora. No config content, token, URL, user, contact address or rules are printed. This counts **files**, not installed/active rules. It changes no containers, rules or services.

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
test "$(id -u)" -eq 1002

echo "===== GRAFANA CONTAINER ====="
if ! podman container exists grafana; then
  echo "GRAFANA_CONTAINER=NOT_FOUND"
  exit 0
fi
podman inspect grafana --format 'STATE={{.State.Status}}'

echo "===== STATIC PROVISIONING FILE COUNTS (NOT ACTIVE RULES) ====="
podman exec grafana sh -c '
  for part in alerting datasources dashboards; do
    dir="/etc/grafana/provisioning/$part"
    if test -d "$dir"; then
      files=$(find "$dir" -type f | wc -l)
      printf "%s_FILES=%s\n" "$part" "$files"
    else
      printf "%s_FILES=DIR_ABSENT\n" "$part"
    fi
  done
'

echo "GRAFANA_EFFECTIVE_RULE_COUNT=UNKNOWN"
echo "GRAFANA_CONTACT_AND_ROUTE_STATUS=UNKNOWN"
echo "NOTIFICATION_DELIVERY=NOT_TESTED"
echo "T003_GRAFANA_READ_ONLY_FILE_CENSUS=FINISHED"
WEBSVC
)
~~~

## 2. Effective Grafana alerting inventory (UI, authenticated read-only)

If the operator already has legitimate access to the **existing** Grafana UI, sign in directly. Do **not** paste the session token, password, screenshot with contact addresses or exported JSON into a chat or GitHub issue.

Record **counts only**, without names, rule expressions or destinations:

| Grafana area | Record | What it proves |
| --- | --- | --- |
| Alerting → Alert rules | Number of Grafana-managed rule groups and rules; count in Firing/Normal/No Data/Error | Rule state visible in Grafana |
| Alerting → Contact points | Number of configured contact points (omit addresses and secrets) | Configuration presence, not tested delivery |
| Alerting → Notification policies | Whether a non-empty notification routing tree exists; count of user-created policies if visible | Routing structure, not successful notifications |
| Alerting → Alertmanager (if available) | Whether Grafana's embedded or external Alertmanager is present | Separate from Prometheus' \`activeAlertmanagers=0\` |
| Connections / Data sources | Count of configured Prometheus-compatible data sources; health check status if already visible | Does not prove PA exporter metrics are ingested |

If UI needs admin changes, stop; do **not** create a new account/token, reset passwords, enable alerting or send test notifications under T003.

## 3. Confirm PA-specific coverage

The 2/2 Prometheus scrape result verifies only two currently configured active targets are UP, **not** which ones or whether PA freshness metrics exist. The next code-level design step requires a **redacted** metric schema inventory from the actual PA exporter. Confirm presence of relevant metric families (e.g. a timestamp or age for most recent successful sync, status, source completeness), without exporting raw labels/values.

Avoid inventing metric names or writing alert expressions before their exact observed names and semantics are verified. If no PA-specific freshness metric exists, record that as a development requirement (not a host configuration defect).

## 4. Acceptance

- **T003 remains PARTIAL** until active Grafana rule/routing state is assessed and the PA-specific scrape/metric coverage is known. A delivery test, when required, is a separate Product Owner gate and must be done without leaking receiver details.
- Absence of Prometheus-managed rules or external Alertmanagers does **not** imply Grafana-managed alerting is absent; conversely configured Grafana contacts do **not** mean notification delivery works.
- Nothing in this document authorizes writing to Prometheus/Grafana/Podman, installing exporters or merging PR #39.
