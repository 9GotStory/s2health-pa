#!/usr/bin/env bash
# T007: disposable PostgreSQL 18 GREEN evidence only. No Production access.
# Execute as Fedora personal account in a clean T007 branch checkout.
set -euo pipefail
umask 077

BASE_SHA=8890e7bb087ae955252b074178860f113a45ca17
PG_IMAGE=docker.io/library/postgres@sha256:0377e72c5289ed2f98cf61b1a9c2db9eb9d300317fe14244492fbc94343b3d04
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
die() { echo "T007_GREENCHECK=BLOCKED: $*" >&2; exit 2; }

for command in git podman node npm timeout od grep sed tr mktemp cut seq tail; do
  command -v "$command" >/dev/null 2>&1 || die "missing tool $command"
done

test "$(id -u)" -ne 0 || die "root user not allowed"
test "$(id -un)" != websvc || die "Production service account not allowed"
test -z "${TEST_DATABASE_URL:-}" || die "unset inherited TEST_DATABASE_URL"
test -z "${PA_ALLOW_DESTRUCTIVE_DB_TESTS:-}" || die "unset inherited destructive consent"
test "$(git -C "$ROOT" branch --show-current)" = 032-sync-target-guard-green ||
  die "wrong git branch"
git -C "$ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD ||
  die "expected main SHA not in branch lineage"
test -z "$(git -C "$ROOT" status --porcelain)" || die "dirty worktree"
case "$(git -C "$ROOT" remote get-url origin)" in
  https://github.com/9GotStory/s2health-pa|https://github.com/9GotStory/s2health-pa.git|git@github.com:9GotStory/s2health-pa|git@github.com:9GotStory/s2health-pa.git) ;;
  *) die "noncanonical origin" ;;
esac

while IFS= read -r changed; do
  case "$changed" in
    backend/src/sync/authorization.ts|backend/src/sync/orchestrator.ts|backend/src/sync/run.ts|backend/test/sync-authorization.unit.test.ts|backend/test/sync-orchestrator.integration.test.ts|backend/test/sync-target-policy.unit.test.ts|backend/test/t006-isolated-pg18-red.sh|backend/test/t007-isolated-pg18-green.sh) ;;
    *) die "out of T007 scope: $changed" ;;
  esac
done < <(git -C "$ROOT" diff --name-only "$BASE_SHA"...HEAD)
case "$(node -v)" in
  v24.*) ;;
  *) die "Node 24 required" ;;
esac

echo "===== T007 ISOLATED PG18 EVIDENCE ====="
echo "HEAD=$(git -C "$ROOT" rev-parse HEAD)"
echo "USER=$(id -un)"
echo "PG_IMAGE=$PG_IMAGE"
echo "DB_ISOLATION=ROOTLESS_TEMPORARY_NO_HOST_VOLUMES"
echo "NETWORK=LOOPBACK_DYNAMIC_PORT"
echo "PRODUCTION_DATA=NOT_USED"

suffix="$(od -An -N 6 -tx1 /dev/urandom | tr -d ' \n')"
name="s2health-t007-${suffix}"
dbname="s2health_t007_${suffix}_test"
password="$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')"
tmp="$(mktemp -d -t t007-green-XXXXXXXX)"
created=0
cleanup() {
  if test "$created" = 1; then
    podman rm -f "$name" >/dev/null 2>&1 || true
    if podman container exists "$name"; then
      echo "TEMP_CONTAINER_CLEANUP=FAILED" >&2
    else
      echo "TEMP_CONTAINER_CLEANUP=PASS"
    fi
  fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$ROOT/backend"
npm ci --ignore-scripts --no-audit --no-fund >"$tmp/npm.log" 2>&1 ||
  die "npm ci failed"
npm run typecheck >"$tmp/typecheck.log" 2>&1 ||
  die "Typecheck failed (not valid GREEN)"
npm run build >"$tmp/build.log" 2>&1 ||
  die "Build failed (not valid GREEN)"
echo "TYPECHECK=PASS"
echo "BUILD=PASS"

# Immutable digest, no production network or volumes, random host loopback port.
export POSTGRES_PASSWORD="$password"
podman run --rm -d --pull=missing \
  --name "$name" \
  --memory=768m --cpus=1 --pids-limit=128 \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_PASSWORD \
  --env POSTGRES_USER=postgres \
  --env "POSTGRES_DB=$dbname" \
  "$PG_IMAGE" >"$tmp/container-id" || die "Podman temporary DB failed"
created=1
unset POSTGRES_PASSWORD

mapping="$(podman port "$name" 5432/tcp)"
case "$mapping" in
  127.0.0.1:*) ;;
  *) die "not bound to loopback-only address" ;;
esac
port="${mapping##*:}"
case "$port" in
  ''|*[!0-9]*) die "invalid mapped port" ;;
esac

# The official PostgreSQL Docker entrypoint temporarily starts a
# UNIX-socket-only postmaster for initdb, then deliberately shuts it down
# before starting the final TCP-listening server. A socket-based pg_isready
# returns success too early during that temporary phase.
# Probe TCP inside this ephemeral container; it only becomes available
# after the final PostgreSQL server starts.
echo "PG18_READINESS=WAITING_FOR_FINAL_TCP_SERVER"
ready=0
for _ in $(seq 1 90); do
  if podman exec "$name" pg_isready -h 127.0.0.1 -q -U postgres -d "$dbname" 2>/dev/null; then
    ready=1
    break
  fi
  if ! podman container exists "$name"; then
    echo "PG18_STARTUP=CONTAINER_EXITED_BEFORE_TCP_READY"
    die "temporary PG18 exited during initialization; no integration tests executed"
  fi
  sleep 1
done
if test "$ready" != 1; then
  echo "PG18_STARTUP=TCP_READINESS_TIMEOUT"
  die "temporary PG18 final TCP server not ready; no integration tests executed"
fi

# Only inspect the locally isolated container (no host PostgreSQL).
# Query over the local socket is now safe because the final TCP server
# is confirmed reachable; credentials never appear in the output.
version="$(podman exec "$name" psql -U postgres -d "$dbname" -Atqc 'SHOW server_version_num')" ||
  die "temporary PG18 version probe failed after TCP readiness"
case "$version" in
  18????) ;;
  *) die "not PostgreSQL 18: $version" ;;
esac
echo "PG18_FINAL_TCP_READY=PASS"
echo "POSTGRES_MAJOR=18"
echo "DB_NAME_SUFFIX=_test"

url="postgresql://postgres:$password@127.0.0.1:$port/$dbname"
unset password

for suite in sync-orchestrator sync-transport-config-lock; do
  echo "PG18_${suite}_INTEGRATION=START"
  set +e
  TEST_DATABASE_URL="$url" PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES \
    timeout --signal=TERM --kill-after=10s 300s \
    node --test --test-reporter=tap \
      "dist/test/${suite}.integration.test.js" \
    >"$tmp/${suite}.tap" 2>&1
  exit_status=$?
  set -e
  echo "TEST_PROCESS_EXIT_${suite}=$exit_status"
  if test "$exit_status" -ne 0; then
    echo "T007_PG18_GREEN=FAILED"
    exit 3
  fi
  passed="$(grep -E '^# pass [0-9]+$' "$tmp/${suite}.tap" | tail -1 | cut -d' ' -f3)"
  failed="$(grep -E '^# fail [0-9]+$' "$tmp/${suite}.tap" | tail -1 | cut -d' ' -f3)"
  skipped="$(grep -E '^# skipped [0-9]+$' "$tmp/${suite}.tap" | tail -1 | cut -d' ' -f3)"
  case "$passed" in
    ''|0|*[!0-9]*) die "no real PG18 tests executed for $suite" ;;
  esac
  test "$failed" = 0 || die "integration suite $suite has failures"
  test "$skipped" = 0 || die "integration suite $suite skipped cases"
  echo "PG18_${suite}_PASS=$passed"
done
unset url
echo "T007_PG18_GREEN=PASS"
echo "TEMP_CONTAINER_CLEANUP=CHECK_ON_EXIT"
