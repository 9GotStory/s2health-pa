# Frontend Stabilization Baseline — 2026-10-07

## Status

**ACCEPTED / PRODUCTION DEPLOYED**

This record closes the first public frontend stabilization phase for S2Health PA.

## Functional production baseline

- Public repository: `9GotStory/s2health-pa`
- Functional production commit: `a7df59805a405097d64268f0dfbc4538b3f7cbf3`
- Public site: `https://9gotstory.github.io/s2health-pa/`
- Public API origin: `https://9gotstory-fedora.tailc3e1aa.ts.net:10000`

## Frontend upstream authority

- Upstream repository: `9GotStory/pa-dashboard`
- Upstream branch: `develop`
- Upstream authority commit: `c8a8edaef589f23ee9047529d13425f861d4190c`

Shared dashboard frontend behavior is ported from this upstream rather than independently reimplemented in `s2health-pa`.

## Backend public API authority

The public API deployment remains unchanged from the previously accepted Backend-v2 ingress release:

- API source authority: `bb8c6e8034a61a5ce9ec792513fb9532325a34c4`
- API OCI digest: `sha256:6fd590ed742c61e9d159b48ad0fb91d97b37daeb285efe09b523f76dbaea6a8b`
- ingress: Tailscale Funnel HTTPS `:10000` → loopback `127.0.0.1:13001`
- allowed browser origin: `https://9gotstory.github.io`

Backend-v2, PostgreSQL, CORS, and Funnel were not modified during frontend stabilization.

## Final production acceptance

Final post-merge production commit:

`a7df59805a405097d64268f0dfbc4538b3f7cbf3`

Accepted GitHub Actions runs:

- CI: `37574823297` — success
- Deploy GitHub Pages: `37574823283` — success

The production deployment passed:

- dashboard data contract tests
- raw-count KPI semantic tests
- accessibility contract tests
- ESLint
- Next.js static export
- public export boundary validation
- public API configuration validation
- GitHub Pages artifact upload
- GitHub Pages deployment

## Stabilization scope accepted

The following milestones are closed:

1. Public API / CORS / Funnel baseline
2. Frontend rebase from the proven `pa-dashboard` frontend
3. Dashboard UAT refinement #1
4. Dashboard UAT refinement #2
5. Keyboard accessibility and modal focus management
6. Raw-count KPI presentation semantics
7. Public CI and Pages deployment quality gates

## Architecture boundary

```text
GitHub Pages
https://9gotstory.github.io/s2health-pa/
        |
        | HTTPS / CORS
        v
Tailscale Funnel :10000
        |
        v
127.0.0.1:13001
        |
        v
pa-dashboard-api Backend-v2
        |
        v
PostgreSQL
```

The frontend does not reimplement Backend-v2 KPI calculation rules.

## Verified merged branches eligible for deletion

These branches are no longer needed for code history because their pull requests are merged.

### s2health-pa

| Branch | Merged PR |
| --- | ---: |
| `feature/dashboard-foundation` | #1 |
| `feature/dashboard-ux-refinement` | #2 |
| `feature/pa-dashboard-frontend-rebase` | #3 |
| `sync/pa-dashboard-22bcf629` | #4 |
| `sync/pa-dashboard-bba48f3c` | #5 |
| `sync/pa-dashboard-b1fb36b7` | #6 |
| `sync/pa-dashboard-c8a8edae` | #7 |

### pa-dashboard

| Branch | Merged PR |
| --- | ---: |
| `feature/s2health-public-api` | #33 |
| `fix/dashboard-uat-refinements` | #34 |
| `fix/dashboard-uat-refinements-2` | #35 |
| `fix/dashboard-accessibility-uat` | #36 |
| `fix/raw-count-kpi-semantics` | #37 |

Branch deletion is intentionally not claimed by this record. The connected GitHub tool currently exposes branch reads/creation but no branch-delete action.

## Tag and GitHub Release status

No Git tag or GitHub Release object is claimed by this record.

The connected GitHub tool currently exposes release reads but no tag/release creation action. If a formal immutable release marker is created later, it should point to the functional baseline commit:

`a7df59805a405097d64268f0dfbc4538b3f7cbf3`

Recommended tag name:

`frontend-stabilization-2026-10-07`

Recommended release title:

`S2Health PA — Frontend Stabilization Baseline (2026-10-07)`

## Next development rule

Treat this stabilization baseline as the rollback/reference point for the next frontend phase.

For shared dashboard behavior:

1. change and validate it in `pa-dashboard` first;
2. merge upstream;
3. port only the shared surface into `s2health-pa`;
4. preserve the public-only differences documented in `docs/frontend-upstream.md`;
5. require CI + Pages gates before production deployment.
