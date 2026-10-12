# Feature 032 — T002/T003 Fedora Host Evidence (2026-10-12)

**Classification:** Operator-provided redacted host metadata; no credentials or patient payloads  
**Probe date:** October 12, 2026 (Asia/Bangkok; initial 16:20 +07, subsequent read-only follow-up)  
**Status:** **T002 PASS (runtime inventory only); T003 PARTIAL PASS (monitoring not fully proven)**  
**Related:** [host-readonly-audit.md](host-readonly-audit.md), [monitoring-readonly-audit.md](monitoring-readonly-audit.md), [tasks.md](tasks.md), [policy-proposals.md](policy-proposals.md), [PR #39](https://github.com/9GotStory/s2health-pa/pull/39)

## 1. Runtime inventory — T002 closed on observed evidence

| Check | Observed value | Result |
| --- | --- | --- |
| Fedora hostname | 9gotstory-fedora | Context |
| Podman | 5.8.4 | PASS |
| systemd | 259 (259.8-1.fc44) | PASS |
| Host timezone | Asia/Bangkok | PASS |
| Proposed timer calendar syntax | '*-*-* 08:00:00 Asia/Bangkok' resolves 2026-10-13 and 2026-10-14 at 08:00 +07 | Syntax PASS, policy UNAPPROVED |
| Rootless service owner | websvc / UID 1002 | PASS |
| System user manager | user@1002.service LoadState=loaded, ActiveState=active, SubState=running | PASS |
| Login linger | Linger=yes; loginctl State=closing | Operational manager is active; State=closing is not by itself an incident |
| Rootless Podman inventory | podman ps -a ran successfully after cd / | PASS |
| PostgreSQL container | pa-dashboard-db; Postgres immutable digest; healthy, up ~2 weeks | PASS |
| Backend API container | pa-dashboard-api; immutable digest 'sha256:02552be6f42dde9570e24186f720c6b293dab70b68e36916947e12254a20430b'; healthy | PASS |
| Self-hosted Web | pa-dashboard-web up | Observed (not the GitHub Pages public frontend) |
| Monitoring containers | prometheus, grafana, pa-dashboard-private-exporter running | PASS state only |
| Monitoring collection process | pa-dashboard-metrics-collector.service previously observed active | PASS state only; container name not required |
| Sync systemd service | pa-dashboard-sync.service loaded / generated / inactive / Result=success | PASS; expected after one-shot |
| Named scheduled sync timer | pa-dashboard-sync.timer LoadState=not-found / inactive | No named timer installed |
| Unidentified 10-second hash timers | Two systemd-run transient timers with descriptions '/usr/bin/podman healthcheck run <container-id>' and Transient=yes | **RESOLVED: Podman Healthchecks, not MOPH Sync timers** |
| Other user timers | grub-boot-success.timer; systemd-tmpfiles-clean.timer | Not MOPH scheduler |
| Existing Sync Quadlet checksum | sha256 '36484f098ef4b74017861f23a964ca56e2456076f2cf78c6689510f8bec4789c' | Recorded |
| Installed Sync OCI image | ghcr.io/9gotstory/pa-dashboard-api@sha256:3ac723826d793f7394dc00c8e65a9949ee3398a7e29b682410e08f5c4800b535 | Unchanged from one-shot recovery |
| Sync entrypoint/network | node dist/src/sync/run.js / pa-dashboard-app.network | Unchanged |

**T002 conclusion:** runtime and currently loaded timer inventory meets Phase-0 evidence acceptance. The prior 'cannot chdir to /home/thanakorn/Downloads' was an invocation working-directory error, resolved by running cd / in the websvc subprocess; do not change Podman or SELinux for this. Reboot resilience and calendar activation remain separate **future staging/release tests**. Completing T002 does NOT approve timer installation/enablement.

## 2. Monitoring — T003 partial pass

| Check | Observed | Status |
| --- | --- | --- |
| Prometheus rootless container | Running ~7 days | PASS state |
| Prometheus service | Running | PASS state |
| Grafana container/service | Running ~2 weeks | PASS state |
| Private exporter service/container | Running | PASS state |
| Private metrics collector service | Running | PASS state |
| promtool check config /etc/prometheus/prometheus.yml | SUCCESS (syntax valid) | PASS syntax |
| Actual active scrape targets | Not checked | PENDING |
| Prometheus recording/alert rules | Not checked | PENDING |
| Active external Alertmanager | Not checked | PENDING |
| Grafana alert rules/contact points/policies | Not checked | PENDING |
| Notification delivery | Not checked (a dry-run requires a separate approved receiver test) | PENDING |

Prometheus syntax correctness and running exporters **do not** prove telemetry freshness, alert-rule installation, routed delivery or notification permissions. Use the [read-only aggregate API probe](monitoring-readonly-audit.md) next; it prints **counts and health states only**, never raw targets/metrics/secret-bearing endpoints.

## 3. Risks remaining before implementation or production

- **F032-H05 High:** installed Sync Worker OCI source revision is historically older than running API OCI; review image compatibility and exact digest/source parity in a separately approved code/release gate.
- **F032-H06 High:** last verified active data remains FY2569/Q4 and FY2570 readiness is not proven; do not enable a recurring Sync timer using current app_settings and do not change fiscal year automatically.
- **F032-H07 Medium:** currently observed runtime gives no evidence of configured Prometheus/Grafana alerts or receivers; T003 must confirm the live effective state before any alerting work can be scoped.
- **F032-H08 Medium:** systemd transient healthcheck timers are unrelated to the named sync timer; do not stop them.
- **F032-H09 Medium:** user-manager active now + Linger=yes do not constitute reboot survival testing. Stage that validation for the host release gate without perturbing Production during P0.

## 4. Task status

- **T001:** Product Owner policy decisions pending, and default 08:00+jitter is still unapproved.
- **T002:** **PASS**, runtime inventory accepted from live operator evidence.
- **T003:** **PARTIAL PASS**; Prometheus API/alert counts and Grafana routing not proven.
- **T004:** FY2570 18-source readiness not yet checked; only earlier two sample sources returned empty.
- **T005:** Specs remain reviewable/draft; Human acceptance and merge approval are separate.
- **Production:** NO change, no sync run, no timer installation, no image cutover.
