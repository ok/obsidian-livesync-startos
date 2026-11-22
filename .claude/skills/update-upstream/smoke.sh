#!/usr/bin/env bash
# Local smoke test of the pinned images, away from the box: a throwaway CouchDB with
# the package's own 00-startos.ini, upstream's provisioning and Setup URI tools from the
# `setup` image, and two LiveSync CLI mirrors that must carry a file from one to the other.
# It runs the same commands startos/utils.ts and startos/main.ts run. Run it from the
# package repo root; it reads the pins from the working tree and cleans up after itself.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

couchdb_image=$(sed -n "s/.*dockerTag: '\(couchdb:[^']*\)'.*/\1/p" startos/manifest/index.ts)
cli_image=$(sed -n "s/.*dockerTag: '\(ghcr.io\/vrtmrz\/livesync-cli:[^']*\)'.*/\1/p" startos/manifest/index.ts)
[ -n "$couchdb_image" ] && [ -n "$cli_image" ] || { echo "could not read the image pins" >&2; exit 1; }

id="ols-smoke-$$"
work=$(mktemp -d)
password=smoke-admin-password
database=smokevault
passphrase=smoke-vault-passphrase
uri_passphrase=smokeuripassphrase

cleanup() {
  docker rm -f "$id-couchdb" "$id-a" "$id-b" >/dev/null 2>&1 || true
  docker network rm "$id" >/dev/null 2>&1 || true
  docker image rm "$id-setup" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAIL: %s\n' "$*" >&2; exit 1; }

step "Pins: $couchdb_image, $cli_image, submodule $(git -C obsidian-livesync describe --tags --always)"

step "Build the setup image"
docker build -q -t "$id-setup" . >/dev/null

step "Start CouchDB with 00-startos.ini"
mkdir -p "$work/local.d"
# The template literal in startos/fileModels/startos.ini.ts, verbatim.
awk '/startosIniContent = `/{on=1; sub(/.*`/,""); } on{ if (/^`/) exit; print }' \
  startos/fileModels/startos.ini.ts >"$work/local.d/00-startos.ini"
grep -q '^require_valid_user = true' "$work/local.d/00-startos.ini" || fail "could not extract 00-startos.ini"
docker network create "$id" >/dev/null
docker run -d --name "$id-couchdb" --network "$id" \
  -e COUCHDB_USER=admin -e COUCHDB_PASSWORD="$password" \
  -v "$work/local.d/00-startos.ini:/opt/couchdb/etc/local.d/00-startos.ini" \
  "$couchdb_image" >/dev/null

curl_db() { docker exec "$id-couchdb" curl -fsS -u "admin:$password" "$@"; }
# The package's readiness probe: /_up without credentials.
for _ in $(seq 1 30); do
  docker exec "$id-couchdb" curl -fsS http://127.0.0.1:5984/_up 2>/dev/null | grep -q '"status":"ok"' && break
  sleep 2
done
docker exec "$id-couchdb" curl -fsS http://127.0.0.1:5984/_up | grep -q '"status":"ok"' \
  || fail "CouchDB did not answer /_up without credentials"

setup_tool() { # <script> <permissions...> -- env passed by the caller with -e
  local script=$1; shift
  docker run --rm --network "$id" -w /opt/livesync -e DENO_DIR=/opt/deno-cache -e NO_COLOR=1 \
    "${env_args[@]}" "$id-setup" \
    deno run --cached-only --config=utils/flyio/deno.jsonc --frozen --lock=utils/flyio/deno.lock \
    "$@" "$script"
}

step "Provision the database (utils/couchdb/provision.ts)"
env_args=(-e "hostname=http://$id-couchdb:5984" -e username=admin -e "password=$password"
  -e "database=$database" -e retry_count=3 -e retry_delay_ms=2000)
setup_tool utils/couchdb/provision.ts --allow-env --allow-net
curl_db "http://127.0.0.1:5984/$database" >/dev/null || fail "the database was not created"

step "Generate a Setup URI for a new vault (utils/setup/generate_setup_uri.ts)"
env_args=(-e remote_type=couchdb -e "LIVESYNC_HOST=http://$id-couchdb:5984" -e LIVESYNC_USER=admin
  -e "LIVESYNC_PASS=$password" -e "LIVESYNC_DB=$database" -e "LIVESYNC_PASSPHRASE=$passphrase"
  -e "uri_passphrase=$uri_passphrase" -e uri_mode=persistent)
output=$(setup_tool utils/setup/generate_setup_uri.ts --allow-env)
# The patterns generateSetupUri() in startos/utils.ts parses the output with.
setup_uri=$(printf '%s\n' "$output" | grep -Eo '^obsidian://setuplivesync\?[^[:space:]]+$' | head -1 || true)
recovery=$(printf '%s\n' "$output" | grep -Eo 'sls-id-v1:[0-9a-f]{64}' | head -1 || true)
[ -n "$setup_uri" ] || { printf '%s\n' "$output" | sed 's/^/    /'; fail "no Setup URI in the generator output"; }
[ -n "$recovery" ] || { printf '%s\n' "$output" | sed 's/^/    /'; fail "no ID recovery code in the generator output"; }
echo "Setup URI and ID recovery code parsed."

step "Generate an ephemeral Setup URI that joins the vault"
env_args+=(-e "id_recovery_code=$recovery")
env_args=("${env_args[@]/uri_mode=persistent/uri_mode=ephemeral}")
output=$(setup_tool utils/setup/generate_setup_uri.ts --allow-env)
printf '%s\n' "$output" | grep -Eq 'usable until [^[:space:]]+Z' \
  || { printf '%s\n' "$output" | sed 's/^/    /'; fail "no 'usable until <timestamp>' in the ephemeral output"; }
join_uri=$(printf '%s\n' "$output" | grep -Eo '^obsidian://setuplivesync\?[^[:space:]]+$' | head -1 || true)
[ -n "$join_uri" ] || fail "no Setup URI in the ephemeral output"
echo "Expiry line and joining URI parsed."

mirror() { # <name> <setup-uri>: what applyMirrorSettings() does, then the daemon from main.ts
  local name=$1 uri=$2
  mkdir -p "$work/$name"
  docker run -d --name "$id-$name" --network "$id" -v "$work/$name:/mirror" \
    --entrypoint sh "$cli_image" -c 'sleep 600' >/dev/null
  docker exec "$id-$name" mkdir -p /mirror/db /mirror/vault
  docker exec "$id-$name" node /app/dist/index.cjs init-settings /mirror/settings.json >/dev/null 2>&1
  printf '%s\n' "$uri_passphrase" | docker exec -i "$id-$name" \
    node /app/dist/index.cjs /mirror/db --settings /mirror/settings.json setup "$uri" >/dev/null
  docker exec -d "$id-$name" sh -c \
    'node /app/dist/index.cjs /mirror/db --settings /mirror/settings.json --vault /mirror/vault daemon >/mirror/daemon.log 2>&1'
}

step "Mirror A: import the Setup URI, run the daemon, write a note"
mirror a "$setup_uri"
sleep 15
echo "smoke $(date -u +%FT%TZ)" >"$work/a/vault/smoke-note.md"
expected=$(cat "$work/a/vault/smoke-note.md")

step "Mirror B: join the same vault and wait for the note"
mirror b "$join_uri"
for _ in $(seq 1 45); do
  [ -f "$work/b/vault/smoke-note.md" ] && break
  sleep 2
done
if [ "$(cat "$work/b/vault/smoke-note.md" 2>/dev/null)" != "$expected" ]; then
  for m in a b; do echo "--- mirror $m daemon log"; tail -25 "$work/$m/daemon.log" 2>/dev/null || true; done
  curl_db "http://127.0.0.1:5984/$database" || true
  fail "the note written to mirror A did not reach mirror B"
fi
echo "The note reached mirror B with the same content."

step "Delete the note on A and wait for B to drop it"
rm "$work/a/vault/smoke-note.md"
for _ in $(seq 1 45); do
  [ -f "$work/b/vault/smoke-note.md" ] || break
  sleep 2
done
[ -f "$work/b/vault/smoke-note.md" ] && fail "the deletion on mirror A did not reach mirror B"
echo "The deletion reached mirror B."

printf '\nPASS: provisioning, Setup URI generation and the mirror all work with these pins.\n'
