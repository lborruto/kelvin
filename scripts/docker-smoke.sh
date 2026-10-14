#!/usr/bin/env bash
# Build the image, run it with the simulator (KELVIN_FAKE=1) under the compose hardening,
# then prove: healthy, uid 10001, private /data, login through the real flow, forwarded
# headers ignored, the SPA served, and nothing private (.env, account.json, node_modules,
# tests, design or agent material, captures) and no world-writable file baked into the
# image. Cleans up on exit, anonymous /data volume included.
#
#   scripts/docker-smoke.sh                      # build kelvin:smoke and test it
#   KELVIN_IMAGE=ghcr.io/lborruto/kelvin:0.1.0 KELVIN_SMOKE_SKIP_BUILD=1 scripts/docker-smoke.sh
set -euo pipefail

IMAGE="${KELVIN_IMAGE:-kelvin:smoke}"
PORT="${KELVIN_SMOKE_PORT:-18080}"
NAME="kelvin-smoke-$$"
SNAP="kelvin-smoke-fs-$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="http://127.0.0.1:${PORT}"
JAR="$(mktemp)"
FILES="$(mktemp)"

cleanup() {
  docker rm -fv "$NAME" "$SNAP" >/dev/null 2>&1 || true
  rm -f "$JAR" "$FILES"
}
trap cleanup EXIT

fail() {
  echo "smoke: FAIL: $*" >&2
  if docker inspect "$NAME" >/dev/null 2>&1; then
    docker logs --tail 50 "$NAME" >&2 2>&1 || true
  fi
  exit 1
}

# Something already answering on the port would take the smoke's requests instead of Kelvin.
if (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  fail "port ${PORT} on 127.0.0.1 is already in use; free it or set KELVIN_SMOKE_PORT"
fi

if [[ "${KELVIN_SMOKE_SKIP_BUILD:-0}" != 1 ]]; then
  docker build -t "$IMAGE" "$ROOT"
fi

# The image's own filesystem, before anything runs: nothing private may be baked in.
docker create --name "$SNAP" "$IMAGE" >/dev/null
docker export "$SNAP" | tar -t >"$FILES" || fail "could not list the image's files"
[[ -s "$FILES" ]] || fail "the image's file list is empty"
rc=0
leaks="$(grep -E \
  '(^|/)\.env(\..*)?$|(^|/)account\.json$|(^|/)node_modules/|^app/(tests|e2e)/|(^|/)\.impeccable/|(^|/)\.superpowers/|(^|/)docs/superpowers/|(^|/)captures/|(^|/)kelvin\.db$' \
  "$FILES")" || rc=$?
case "$rc" in
  0) fail "the image contains private or build-only files:
$leaks" ;;
  1) ;;
  *) fail "could not search the image's file list" ;;
esac
docker rm -fv "$SNAP" >/dev/null

# No world-writable file anywhere in the image (searched as root, so no directory is skipped).
writable="$(docker run --rm -u 0 --network none --entrypoint find "$IMAGE" / -xdev -type f -perm -0002)" \
  || fail "could not search the image for world-writable files"
[[ -z "$writable" ]] || fail "world-writable files in the image:
$writable"

docker run -d --name "$NAME" \
  -e KELVIN_FAKE=1 \
  -p "127.0.0.1:${PORT}:8080" \
  --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  "$IMAGE" >/dev/null

status=starting
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" == true ]] || fail "the container exited"
  status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME")"
  [[ "$status" == healthy ]] && break
  sleep 2
done
[[ "$status" == healthy ]] || fail "not healthy after 120 s (status: $status)"

[[ "$(docker exec "$NAME" id -u)" == 10001 ]] || fail "not running as uid 10001"
[[ "$(docker exec "$NAME" stat -c '%a' /data)" == 700 ]] || fail "/data is not mode 700"

code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/house")"
[[ "$code" == 401 ]] || fail "/api/house without a session answered $code, not 401"

# Spoofed proxy headers from a client that is not a trusted proxy: both must be ignored.
headers="$(curl -sS -D - -o /dev/null -c "$JAR" \
  -H 'Content-Type: application/json' -H 'X-Kelvin: 1' \
  -H 'X-Forwarded-Proto: https' -H 'X-Forwarded-For: 203.0.113.7' \
  --data '{"email":"demo@kelvin.local","password":"kelvin"}' \
  "$BASE/api/auth/login")"
cookie="$(grep -i '^set-cookie: kelvin_session=' <<<"$headers" || true)"
[[ -n "$cookie" ]] || fail "the demo login set no session cookie"
if grep -qiE ';[[:space:]]*secure([;[:space:]]|$)' <<<"$cookie"; then
  fail "X-Forwarded-Proto was trusted: Secure cookie over plain HTTP"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/api/house")"
[[ "$code" == 200 ]] || fail "/api/house with the session answered $code"
page="$(curl -fsS "$BASE/")" || fail "GET / failed"
grep -q '<title>Kelvin</title>' <<<"$page" || fail "the web app is not served"

[[ "$(docker exec "$NAME" stat -c '%a' /data/account.json)" == 600 ]] \
  || fail "/data/account.json is not mode 600"
[[ "$(docker exec "$NAME" stat -c '%a' /data/kelvin.db)" == 600 ]] \
  || fail "/data/kelvin.db is not mode 600"
# SQLite's WAL and shared-memory files hold the same data; they exist only while it is open.
for f in kelvin.db-wal kelvin.db-shm; do
  if docker exec "$NAME" test -e "/data/$f"; then
    [[ "$(docker exec "$NAME" stat -c '%a' "/data/$f")" == 600 ]] || fail "/data/$f is not mode 600"
  fi
done
docker exec "$NAME" test -s /usr/share/licenses/kelvin/fonts/Onest-OFL-1.1.txt \
  || fail "the font licences are missing"
docker exec "$NAME" test -s /usr/share/licenses/kelvin/fonts/JetBrainsMono-OFL-1.1.txt \
  || fail "the font licences are missing"

echo "smoke: ok"
