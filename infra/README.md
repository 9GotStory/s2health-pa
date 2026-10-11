# G-03 — S2Health PA API OCI & Quadlet Source (not a deployment)

This folder is **reviewable source** for the API image build, PostgreSQL/Podman
Quadlet compatibility, a staging-only renderer, and CI/OCI publication contracts.
It contains **no** Fedora runtime installation actions.

## Source of truth and boundaries

- Canonical repository: `https://github.com/9GotStory/s2health-pa`, beginning after
  G-02 `main@961d6de6aaf760ad57727468d9cd27436e505e8a`.
- Historical API/Quadlet source: `9GotStory/pa-dashboard/develop` at
  `a3862692c7ffd8dda3c593fd029e1bb67b7fd68b`.
- Existing rootless Fedora owner: `websvc`. **Do not** edit its installed
  Quadlet units, change systemd, use `podman auto-update`, run DB migrations,
  access live secrets, or recreate networks/volumes under this source-only gate.
- The deployed self-hosted `pa-dashboard-web.service` has its own old image
  revision. The public Next.js frontend is separately hosted on GitHub Pages.
  **No self-hosted web OCI build, image release or web Quadlet is imported.**
- This repository does **not** manage Traefik, Cloudflared, Grafana, Prometheus,
  the platform `edge` or `observability` networks, or public routing.

## Image model

`infra/containers/api.Containerfile` builds from `backend/` with Node 24,
installs only production dependencies in the final stage, runs as the unprivileged
`node` user and includes the original SQL migrations. The same image contains
all four preexisting entry points:

| Purpose | Command |
| --- | --- |
| HTTP API | `node dist/src/server.js` |
| Migration | `node dist/src/db/migrate.js` |
| Reference population | `node dist/src/reference/populate.js` |
| MOPH sync | `node dist/src/sync/run.js` |

CI builds the API locally without pushing it. A *future explicitly approved*
`oci-<first12ofcommit>` Git tag can trigger
`.github/workflows/oci-release.yml` to publish exactly one image:

`ghcr.io/9gotstory/s2health-pa-api:sha-<full40charsha>`

The release fails closed unless the tag resolves to the **current main HEAD**.
It emits the immutable `@sha256:<64-hex>` image reference in the GitHub Actions
summary. **This G-03 source PR creates no tag, publishes no GHCR package, and
does not authorize publishing or production cutover.** The release workflow has
no `workflow_dispatch` and no branch/scheduled publication trigger.

Image metadata identifies `9GotStory/s2health-pa` and the source revision.
The previous `pa-dashboard-api` GHCR image stays available for rollback.

## Fedora compatibility must be preserved

| Area | Keep unchanged for first cutover |
| --- | --- |
| API unit/container/DNS alias | `pa-dashboard-api.service` / `pa-dashboard-api` |
| API host publishing | `127.0.0.1:13001:3001` |
| Rootless Podman application network | Quadlet source `pa-dashboard-app.network`; installed `systemd-pa-dashboard-app` |
| PostgreSQL unit/container | `pa-dashboard-db.service` / `pa-dashboard-db` |
| PostgreSQL persistent volume | source `pa-dashboard-db-data.volume`; actual `systemd-pa-dashboard-db-data` |
| PostgreSQL 18 mount | `/var/lib/postgresql` (not `/var/lib/postgresql/data`) |
| Config files | `%h/.config/pa-dashboard/*.env` outside Git |
| Migration startup dependency | `pa-dashboard-migrate.service`, one-shot `RemainAfterExit=yes` |
| Reference and sync jobs | manual one-shots, no install/timer and no new schedule |
| Historical self-hosted web unit | left installed and unmodified; no replacement web template |

Do not rename resources, reset PostgreSQL, or alter old migration checksums
merely because the image owner changes repositories.

## Staging renderer, without installing anything

`infra/render-quadlets.mjs` accepts **only** immutable image digests:

```sh
node infra/render-quadlets.mjs \
  --output /tmp/s2health-quadlet-review \
  --api-image 'ghcr.io/9gotstory/s2health-pa-api@sha256:<64 lowercase hex>' \
  --db-image 'docker.io/library/postgres@sha256:<64 lowercase hex>'
```

The example digest fields are placeholders, not valid actual refs. The output
directory must be missing or empty, and must not be the user's installed Quadlet
folder. Review the seven generated files in staging; **do not copy them to
`~/.config/containers/systemd` under this gate**. A first cutover would
carefully replace *only* an approved API image reference, preserving existing
web/network/database/volume sources. Never synchronize with `--delete` against
the production Quadlet directory.

## Verification gates

1. `node --test infra/test/deployment-contract.test.mjs` passes with no host
   side effects, covering immutable images, render fail-closed, unit topology,
   manual sync/reference semantics and OCI trigger/authority.
2. `docker build --file infra/containers/api.Containerfile --build-arg
   SOURCE_REVISION=<full source commit sha> --tag s2health-pa-api:ci .`
   succeeds in isolated GitHub CI, with **no push**.
3. Original Next.js frontend CI and Backend-v2 tests stay passing on candidate
   and merge SHAs. Neither source G-03 nor a future CI-only change should
   automatically publish GHCR or restart Fedora.
4. Merge requires a separate explicit Human Product Owner approval even when
   CI succeeds; tag publication, package visibility and Fedora cutover each
   require **additional explicit approvals**.
5. Before any host cutover, obtain current runtime inventory, fresh usable
   logical database backup, an isolated restore proof, exact immutable image
   digest, current migration ledger, recorded rollback digest and operational
   checks. Live DB tests are prohibited.

## Excluded from G-03

No GHCR image publication, no OCI tags, no GitHub Pages release, no host
operations, no new API version, no schema mutations, no legacy Apps Script
files, no self-hosted web OCI build, and no automated synchronization timer.
