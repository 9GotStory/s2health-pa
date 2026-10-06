# s2health-pa

Public frontend for the Song District Health PA Dashboard (Fedora-backed edition).

## Public URL

https://9gotstory.github.io/s2health-pa/

## Architecture

- Frontend: GitHub Pages
- API: Fedora `pa-dashboard-api` (public HTTPS endpoint will be configured separately)
- Database: PostgreSQL on Fedora
- Monitoring: Prometheus / Grafana / private exporter on Fedora

## Boundaries

- This repository does **not** replace or modify `9GotStory/pa-dashboard`.
- Do not commit credentials, database connection strings, Tailscale auth keys, tokens, or other secrets.
- Environment-specific API endpoints must not be hardcoded into application source.
- The current landing page is intentionally API-independent until the Fedora public API endpoint is finalized.
