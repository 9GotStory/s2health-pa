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

## Public API ingress

The Fedora `pa-dashboard-api` is the public read API for this frontend.

Host deployment keeps the API on the private application network and publishes
only `127.0.0.1:13001 -> 3001` for host-local ingress. Tailscale Funnel is
configured separately to proxy public HTTPS traffic to that loopback endpoint.

Browser CORS is configured on the API through host-only `PA_CORS_ORIGINS`;
the GitHub Pages origin is `https://9gotstory.github.io`.

No extra application gateway is required.
