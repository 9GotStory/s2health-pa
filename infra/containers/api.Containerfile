# S2Health PA Backend-v2 runtime image, preserving deployed PA database and API contracts.
#
# Multi-stage build: the builder installs all dependencies and compiles the
# TypeScript backend; the runtime image installs production dependencies only
# and carries the compiled dist tree plus the SQL migrations.
#
# The same image runs every backend command:
#   - API server:             node dist/src/server.js
#   - database migration:     node dist/src/db/migrate.js
#   - reference population:   node dist/src/reference/populate.js
#   - MOPH synchronization:   node dist/src/sync/run.js
#
# Working directory /app keeps the existing migration path resolution working:
# dist/src/db/migrate.js resolves ../../../ to /app, so migrations are
# expected at /app/migrations.

FROM docker.io/library/node:24-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./

RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src

RUN npm run build

FROM docker.io/library/node:24-alpine AS runtime

ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/9GotStory/s2health-pa" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node backend/migrations ./migrations

RUN chown -R node:node /app

USER node

CMD ["node", "dist/src/server.js"]
