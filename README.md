# s2health-pa

Public frontend for the Song District Health PA Dashboard (Fedora-backed edition).

## Public URL

https://9gotstory.github.io/s2health-pa/

## Architecture

- Frontend: GitHub Pages
- API: Fedora `pa-dashboard-api`
- Database: PostgreSQL on Fedora
- Public API ingress: Tailscale Funnel over HTTPS
- Monitoring: Prometheus / Grafana / private exporter on Fedora

## Runtime API configuration

The Fedora API URL is **not hardcoded** in application source.

GitHub Actions generates `site/config.js` at deployment time from the repository
Actions variable:

`PUBLIC_API_BASE_URL`

The public frontend uses:

`/api/v1/health/ready`

to verify that the Fedora API and database are ready.

For browser access, the Fedora API ingress must allow the origin:

`https://9gotstory.github.io`

No credentials belong in `PUBLIC_API_BASE_URL`; it is a public endpoint value, not a secret.

## Boundaries

- This repository does **not** replace or modify `9GotStory/pa-dashboard`.
- Do not commit credentials, database connection strings, Tailscale auth keys, tokens, or other secrets.
- Environment-specific API endpoints must not be hardcoded into application source.
- The existing `pa-dashboard` GitHub Pages + Google Apps Script deployment remains independent.


## Public API gateway

The repository includes `gateway/gateway.mjs`, a small Node.js reverse proxy intended
to run on Fedora beside the private API.

It exposes only these upstream routes:

- `GET /api/v1/health/ready`
- `GET /api/v1/kpis`
- `GET /api/v1/facilities`
- `GET /api/v1/tambons`
- `GET /api/v1/dashboard`

The gateway does not expose `/api/v1/sync-status` or arbitrary API paths. It accepts
configuration through environment variables (`UPSTREAM_ORIGIN`, `ALLOWED_ORIGIN`,
`GATEWAY_HOST`, `GATEWAY_PORT`) so host-specific addresses remain outside source.
