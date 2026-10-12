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
| Actual active scrape targets | 2 configured active; 2 UP; 0 DOWN (16:47 +07) | PASS for scrape health at observation time; job identities not yet verified |
| Prometheus recording/alert rules | 0 groups; 0 recording; 0 alerting | **No Prometheus-managed rules** at observation time |
| Active external Alertmanager | 0 active endpoints reported via Prometheus API | **No active Prometheus-discovered Alertmanager** |
| Grafana provisioning file count | Running; `alerting_FILES=0`, `datasources_FILES=1`, `dashboards_FILES=1` (read-only operator inspection, Oct 12) | PASS for **file census only**; no evidence of effective Grafana rules/contacts |
| Grafana alert rules/contact points/policies | Effective Grafana UI/API state not checked | PENDING; zero alerting provisioning files does **not** prove absence of DB/UI-defined rules |
| Notification delivery | Not checked (a dry-run requires a separate approved receiver test) | PENDING |

**Observed Prometheus effective-state probe (2026-10-12 16:47 +07):** `/api/v1/rules` groups=0/alerting=0/recording=0; `/api/v1/targets?state=active` total=2/up=2/down=0; `/api/v1/alerts` active=0/firing=0; `/api/v1/alertmanagers` active=0. The read-only result validates current target connectivity, **not** PA metric coverage or alert readiness. Because no Prometheus-managed rules are installed, zero firing alerts must not be interpreted as an all-clear. Grafana-managed rules, contacts and delivery are still unknown. The [aggregate-only probe](monitoring-readonly-audit.md) is retained for future verification.

### Grafana file census — operator evidence

The operator queried the existing running Grafana container with `podman exec` and counted files in the standard provisioning directories only:

- `STATE=running`
- `alerting_FILES=0`
- `datasources_FILES=1`
- `dashboards_FILES=1`
- `T003_GRAFANA_READ_ONLY=FINISHED`

This does not enumerate effective Grafana-managed alert rules, notification contact points, policies or receivers persisted through the UI/database. A provisioning file can also be present without proving its configuration loaded successfully. **No secret, endpoint or actual rule content was exported.** The next step is an existing authenticated Grafana UI inspection recording **counts and high-level states only**, with no new login, token creation, configuration edits or notification test. See [Grafana read-only procedure](grafana-readonly-audit.md).

## 3. Risks remaining before implementation or production

- **F032-H05 High:** installed Sync Worker OCI source revision is historically older than running API OCI; review image compatibility and exact digest/source parity in a separately approved code/release gate.
- **F032-H06 High:** last verified active data remains FY2569/Q4 and FY2570 readiness is not proven; do not enable a recurring Sync timer using current app_settings and do not change fiscal year automatically.
- **F032-H07 High (monitoring gap):** Prometheus has **zero configured effective alerting and recording rules and zero active external Alertmanager endpoints** at 2026-10-12 16:47 +07. Grafana-managed rules/contacts may exist but have not been inspected. T003 must verify Grafana state and PA target/metric coverage before alerting architecture can be finalized.
- **F032-H08 Medium:** systemd transient healthcheck timers are unrelated to the named sync timer; do not stop them.
- **F032-H09 Medium:** user-manager active now + Linger=yes do not constitute reboot survival testing. Stage that validation for the host release gate without perturbing Production during P0.

## 4. Task status

- **T001:** Product Owner policy decisions pending, and default 08:00+jitter is still unapproved.
- **T002:** **PASS**, runtime inventory accepted from live operator evidence.
- **T003:** **PARTIAL PASS**; Prometheus 2/2 scrape targets UP, 0 managed rules, 0 external Alertmanager. Grafana running; alert provisioning files=0, datasource files=1, dashboard files=1. **Grafana effective rules, contacts, policy routing, delivery, and PA-specific metric coverage remain unverified.**
- **T004:** FY2570 18-source readiness not yet checked; only earlier two sample sources returned empty.
- **T005:** Specs remain reviewable/draft; Human acceptance and merge approval are separate.
- **Production:** NO change, no sync run, no timer installation, no image cutover.
