#!/usr/bin/env bash
# T006: disposable PostgreSQL 18 RED evidence only. No Production access.
# Execute as Fedora personal account in a clean T006 branch checkout.
set -euo pipefail
umask 077

BASE_SHA=8890e7bb087ae955252b074178860f113a45ca17
PG_IMAGE=docker.io/library/postgres@sha256:0377e72c5289ed2f98cf61b1a9c2db9eb9d300317fe14244492fbc94343b3d04
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
die() { echo "T006_REDCHECK=BLOCKED: $*" >&2; exit 2; }

for command in git podman node npm timeout od grep sed tr mktemp cut seq; do
  command -v "$command" >/dev/null 2>&1 || die "missing tool $command"
done

test "$(id -u)" -ne 0 || die "root user not allowed"
test "$(id -un)" != websvc || die "Production service account not allowed"
test -z "${TEST_DATABASE_URL:-}" || die "unset inherited TEST_DATABASE_URL"
test -z "${PA_ALLOW_DESTRUCTIVE_DB_TESTS:-}" || die "unset inherited destructive consent"
test "$(git -C "$ROOT" branch --show-current)" = 032-sync-target-guard-red ||
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
    backend/test/*.ts|backend/test/t006-isolated-pg18-red.sh) ;;
    *) die "out of T006 scope: $changed" ;;
  esac
done < <(git -C "$ROOT" diff --name-only "$BASE_SHA"...HEAD)
case "$(node -v)" in
  v24.*) ;;
  *) die "Node 24 required" ;;
esac

echo "===== T006 ISOLATED PG18 EVIDENCE ====="
echo "HEAD=$(git -C "$ROOT" rev-parse HEAD)"
echo "USER=$(id -un)"
echo "PG_IMAGE=$PG_IMAGE"
echo "DB_ISOLATION=ROOTLESS_TEMPORARY_NO_HOST_VOLUMES"
echo "NETWORK=LOOPBACK_DYNAMIC_PORT"
echo "PRODUCTION_DATA=NOT_USED"

suffix="$(od -An -N 6 -tx1 /dev/urandom | tr -d ' \n')"
name="s2health-t006-${suffix}"
dbname="s2health_t006_${suffix}_test"
password="$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')"
tmp="$(mktemp -d -t t006-red-XXXXXXXX)"
created=0
cleanup() {
  if test "$created" = 1; then
    podman rm -f "$name" >/dev/null 2>&1 || true
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
  die "Typecheck failed (not valid RED)"
npm run build >"$tmp/build.log" 2>&1 ||
  die "Build failed (not valid RED)"
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

ready=0
for _ in $(seq 1 90); do
  if podman exec "$name" pg_isready -q -U postgres -d "$dbname"; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1 || die "temporary PG18 not ready"
version="$(podman exec "$name" psql -U postgres -d "$dbname" -Atqc 'SHOW server_version_num')"
case "$version" in
  18????) ;;
  *) die "not PostgreSQL 18: $version" ;;
esac
echo "POSTGRES_MAJOR=18"
echo "DB_NAME_SUFFIX=_test"

url="postgresql://postgres:$password@127.0.0.1:$port/$dbname"
unset password
set +e
TEST_DATABASE_URL="$url" PA_ALLOW_DESTRUCTIVE_DB_TESTS=YES \
  timeout --signal=TERM --kill-after=10s 300s \
  node --test --test-reporter=tap dist/test/sync-orchestrator.integration.test.js \
  >"$tmp/test.tap" 2>&1
exit_status=$?
set -e
unset url

echo "TEST_PROCESS_EXIT=$exit_status"
test "$exit_status" -ne 0 || die "unexpected GREEN: expected RED"
if test "$exit_status" -eq 124 || test "$exit_status" -eq 137; then
  die "test timed out (not accepted evidence)"
fi

for scenario in "missing approval" "wrong FY" "wrong quarter" \
  "wrong province" "wrong district" "expired approval"; do
  if grep -Eq "not ok [0-9]+ - ${scenario}$" "$tmp/test.tap"; then
    echo "RED_${scenario// /_}=CONFIRMED"
  else
    echo "RED_${scenario// /_}=MISSING"
    die "incomplete RED coverage; inspect local TAP log"
  fi
done
if ! grep -Eq 'not ok [0-9]+ - T006 RED: an unapproved FY/Q/district' "$tmp/test.tap"; then
  die "parent T006 RED test was not exercised"
fi

echo "T006_PG18_RED=CONFIRMED_EXPECTED_FAILURES"
echo "TEMP_CONTAINER=AUTOMATIC_CLEANUP_ON_EXIT"
