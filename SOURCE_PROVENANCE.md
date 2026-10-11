# Source Provenance — S2Health PA

> G-02 / Issue #32. This document tracks the **source-code ownership migration only**.
> No Fedora service, live PostgreSQL database, API endpoint, secret, production container,
> OCI release, or public GitHub Pages deployment is changed by this import.

## Source ownership and immutable baseline

| Role | Repository / immutable revision |
| --- | --- |
| Target system source | `9GotStory/s2health-pa` |
| Target base (after G-01) | `main@3c585b4a4f86bd31541028d91411ba2906b2f8ac` |
| Historical Backend-v2 source | `9GotStory/pa-dashboard/develop@a3862692c7ffd8dda3c593fd029e1bb67b7fd68b` |
| Imported source tree | `backend/`, Git tree `97980956b90bf80b8307c9f97196ee3e214433e7` |
| Imported file count | 36, including runtime code, SQL migrations, dependency manifest/lockfile and tests |

All 36 files under `backend/` were imported with **unchanged bytes**, retaining the exact source
Git Blob SHAs and the complete `backend/` subtree SHA. The existing public frontend,
`next.config.ts`, root dependencies, and `.github/workflows/pages.yml` are not imported
from the upstream project or modified in G-02.

The imported backend retains historical names like `pa-dashboard-backend`, PA_* runtime
variables, and PA dashboard database objects intentionally, to preserve exact provenance
and deployed schema compatibility. Renaming or deployment topology changes require a
separate reviewed change.

## PostgreSQL migration ledger compatibility

The following raw SQL SHA-256 values were verified against the Fedora PostgreSQL
`schema_migrations` ledger *before* import; the new Git blobs are byte-identical to
those verified source files.

| Version | Source filename | Raw SQL SHA-256 |
| --- | --- | --- |
| 0001 | `0001_database_foundation.sql` | `fed3ecac3b6baeb24b500ee880962e4ca9736cb0c4434d2e0b5ff5e0a325a268` |
| 0002 | `0002_sync_run_lifecycle_guard.sql` | `b3cb9409491d7f23eba4ad2aded109a4d67dd1dc45edb12678420c72c0936f35` |
| 0003 | `0003_kpi_target_months_scalar.sql` | `45ab3f27f4a0e69899ed1e5945d2f30d534ec0fdea2f36a815382605a9a6b677` |
| 0004 | `0004_kpi_registry_seed.sql` | `d890b4feeb24f8394172a61d0e6e6852899033eb213e7477cb8b06507f86e537` |
| 0005 | `0005_sync_scope_setting.sql` | `9669cdb5ecbc9ff42f7af934e89c9e1179e0401331b02d5f26f5b743b8d51b30` |

Fedora baseline: `app_state.active_sync_run_id = 1`. These are provenance observations,
not an instruction to write to the database, run migrations or reset any schema.

## Runtime remains independent

At source-import time, the live Fedora API container reports:
- OCI image: `ghcr.io/9gotstory/pa-dashboard-api@sha256:02552be6f42dde9570e24186f720c6b293dab70b68e36916947e12254a20430b`
- Image source revision: `a3862692c7ffd8dda3c593fd029e1bb67b7fd68b`
- PostgreSQL volume: `systemd-pa-dashboard-db-data` mounted at `/var/lib/postgresql`.

The self-hosted PA web image reports a different historical revision,
`0c70f3efce843b92b2a96c884bc036fde9f9f8dc`. It is not the
GitHub Pages public frontend source baseline. No runtime image or volume is
replaced by this import.

## CI and future changes

- The destination frontend CI and Pages workflow remain in place.
- The public frontend root `package.json` changes only its `lint` script
  from `eslint` to `eslint src`: this scopes frontend lint to frontend source
  after adding the independent backend tree. All frontend dependency versions
  and the root lockfile remain untouched.
- **Pages deploy implication:** the G-01 allowlist includes `package.json`;
  merging this PR is expected to cause one GitHub Pages deployment.
  That requires explicit Product Owner approval, even though the backend
  itself is imported without deployment.
- G-02 adds an isolated `backend` CI job: Node 24 `npm ci`, typecheck, build,
  unit/static tests and a skip-guard probe of database integration suites without
  any database URL or destructive-test authorization.
- Destructive PostgreSQL integration tests require a separately authorized,
  **isolated disposable PostgreSQL 18** instance — never production.
- G-03 will review and adapt API OCI/Quadlet infrastructure from the historical
  backend repository. Do not copy legacy Apps Script, `.clasp*`, legacy
  `src/app/sync/**`, upstream standalone web Containerfile or auto-deploy workflow.
- Future backend development should occur in `s2health-pa`; `pa-dashboard/main`
  continues to represent the legacy Google Apps Script + Google Sheets system.
- Import is not merge authorization. Feature branch, CI, technical review and an
  explicit Product Owner merge gate are separate steps.
