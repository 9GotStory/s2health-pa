# s2health-pa

Public frontend for the Song District Health PA Dashboard (Fedora-backed edition).

## Public URL

https://9gotstory.github.io/s2health-pa/

## Architecture

- Frontend: GitHub Pages + native ES modules
- API: Fedora `pa-dashboard-api`
- Database: PostgreSQL on Fedora
- Public API ingress: Tailscale Funnel over HTTPS
- Monitoring: Prometheus / Grafana / private exporter on Fedora
- Frontend runtime dependencies: none

## Runtime API configuration

The Fedora API URL is **not hardcoded** in application source.

GitHub Actions generates `site/config.js` at deployment time from the repository
Actions variable:

`PUBLIC_API_BASE_URL`

The public frontend reads these Backend-v2 endpoints:

- `/api/v1/dashboard`
- `/api/v1/kpis`
- `/api/v1/facilities`
- `/api/v1/tambons`

The API is the KPI calculation authority. The frontend validates the public
contract, cross-checks references, aggregates already-calculated target/result
rows for presentation, and never reimplements KPI calculation rules.

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


## Frontend structure

The dashboard intentionally stays zero-dependency while the interaction surface
is small enough for native browser modules:

- `site/js/contracts.js` — fail-closed validation of the public API contract
- `site/js/model.js` — pure presentation aggregation and filtering
- `site/js/api.js` — CORS fetch lifecycle and runtime config validation
- `site/js/view.js` — DOM presentation using `textContent` for dynamic data
- `site/js/app.js` — startup orchestration
- `site/styles.css` — responsive design system
- `test/*.test.js` — Node built-in unit tests with no package dependencies

Run locally:

```sh
node --test test/*.test.js
node --check site/js/*.js
```

Both CI and the Pages deployment run the tests, syntax checks, and a guard
against direct `innerHTML`/`outerHTML` assignment before publication.
