---
name: update-upstream
description: Check Self-hosted LiveSync upstream for a new release and bring this StartOS package up to it, end to end — compare the four pins, read what changed where it matters to the package, apply the bump from UPDATING.md, write the release notes, build, smoke-test the new images locally, then (after one approval) open the PR, merge, wait for Tag and Release and update the box. Use when asked to check for upstream updates, bump, update or refresh obsidian-livesync / LiveSync / "the sync server" package, or to do the regular update. Takes an optional upstream version (e.g. 1.0.52); without one, targets the newest stable release whose CLI image exists.
---

# Update the package to a new upstream release

`UPDATING.md` is the recipe: which four things are pinned, how to find their newest
versions, which fields to edit. Read it first; this skill drives it and does not restate
it. The workspace guide (`maintaining-a-package.md` § Chasing upstream, `versions.md`
§ Release Notes) holds the rules. The skill is resumable: step 0 finds out how far a
previous run got.

## Names

| | |
|---|---|
| Package repo | this repo, GitHub `ok/obsidian-livesync-startos`, base branch `main` |
| Upstream | `vrtmrz/obsidian-livesync`, tags without a `v` |
| Package version | `<upstream>:<revision>`, tag `v<upstream>_<revision>`; an upstream bump is revision `0` |
| Bump branch | `ok/upstream-<version>` |
| Registry | `https://registry.zsapping.net` — both `REFERENCE_REGISTRY` and `RELEASE_REGISTRY` |
| Box | the `host` in the workspace's `.startos/config.yaml`, x86_64, reachable only from the LAN |

## 0. Where are we

Collect all of this, then report it as one short table before doing anything else:

1. The four pins against their newest versions, with the commands in `UPDATING.md`
   § Determining the upstream version. `git -C obsidian-livesync fetch --tags` first.
   Read the tag list, not the "Latest" badge, skip prereleases, and take the newest
   release that also has its `<X.Y.Z>-cli` image tag. The image must list both
   `linux/amd64` and `linux/arm64`:
   ```bash
   TOKEN=$(curl -fsSL "https://ghcr.io/token?scope=repository:vrtmrz/livesync-cli:pull" | jq -r .token)
   curl -fsSL -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
     https://ghcr.io/v2/vrtmrz/livesync-cli/manifests/<X.Y.Z>-cli | jq -c '[.manifests[].platform | "\(.os)/\(.architecture)"]'
   ```
2. `npm view @start9labs/start-sdk version` against the pin in `package.json`.
3. What is released and running:
   - `start-cli -r https://registry.zsapping.net registry package get obsidian-livesync short --format json | jq '.best | keys'`
   - `start-cli package installed-version obsidian-livesync` (retry once if the first
     call after idle fails with `error sending request`)
   - whether the box runs the mirror — a `mirror` entry under `health` in
     `start-cli db dump --format json | jq -c '(.value // .).packageData["obsidian-livesync"].statusInfo | {started, desired, health}'`.
     Without one, CLI changes do not touch the box at all.
4. `gh pr list` and `git branch -r` for a bump already in flight on
   `ok/upstream-<version>`. Resume it instead of starting another.

If nothing is newer, say so and stop.

## 1. Read what changed, and decide whether to bump

Upstream releases several times a week and most releases are plugin-only. With `<old>`
the pinned tag and `<new>` the target:

```bash
git -C obsidian-livesync diff --stat <old> <new> -- utils src/apps/cli docker
git -C obsidian-livesync diff <old> <new> -- updates.md | grep '^+'
```

Then read the diffs that the stat shows, and answer with evidence:

- **`utils/` (provisioning, Setup URI generator, their `deno.jsonc` / `deno.lock`)** —
  anything but tests changed? Then `UPDATING.md` § Applying the bump steps 3 and 4
  are real work: the `Dockerfile` paths, the environment variables `startos/utils.ts`
  passes, the three output patterns `generateSetupUri()` matches, and every setting
  `provision.ts` applies against `startos/fileModels/startos.ini.ts`.
- **`src/apps/cli/`** — the mirror runs `init-settings`, `setup <uri>` and
  `--vault … daemon`, nothing else. Did their arguments, the settings file or the image
  layout (`/app/dist/index.cjs`) change? A fix to `fetch`, `rebuild` or another command
  the package never runs does not reach a user and gets no release-note line.
- **`docker/`** — upstream's own CouchDB setup. A change there is a hint that the
  server configuration upstream expects has moved; check it against `00-startos.ini`
  and the `/_up` readiness probe in `startos/main.ts`.
- **Formats** — any note in `updates.md` or the linked Commonlib release notes about
  the database, chunk, encryption or Setup URI format, or about mixed versions between
  devices. That is the major-review scope whatever the version number says, and it
  goes into the release notes as something the user must do.
- **CouchDB / Deno**, when they moved: `UPDATING.md` names what to read first.

Verdict, one of:

- **Nothing here changed and no other pin moved** — a bump would ship the same bytes
  under a new number. Report that and stop, unless the user wants to stay current anyway.
- **Routine** — pins move, no package code changes.
- **Needs package work** — say what, and do it in the same branch, with `README.md` and
  `instructions.md` updated where they become wrong.

## 2. Apply the bump

1. `git switch -c ok/upstream-<new>` from an up-to-date `main`.
2. `UPDATING.md` § Applying the bump, for the application and for every other pin that
   has a newer version (they ride along with any release; they never move `<upstream>`).
   Bump the SDK too if step 0 found a newer one.
3. `startos/versions/current.ts`: `version: '<new>:0'` and new `releaseNotes`, edited in
   place — keep the empty `up` and `down: IMPOSSIBLE` unless this bump needs a
   migration. Notes in all five locales (`en_US`, `es_ES`, `de_DE`, `pl_PL`, `fr_FR`),
   following `versions.md` § Release Notes: what a user of *this server* notices, then
   the link `https://github.com/vrtmrz/obsidian-livesync/blob/<new>/updates.md`. Plugin
   changes arrive through Obsidian's own plugin update, not through this package, so
   they are not this package's news. Use the terms the locale already uses in
   `startos/i18n/dictionaries/translations.ts` (the mirror is `Réplica de la bóveda`,
   `Vault-Spiegel`, `Kopia lustrzana sejfu`, `Miroir du coffre`).
   If the registry does not serve the version now in `current.ts`, do not claim a new
   one on top of it without reading `versions.md` § A version is released once the
   reference registry serves it.

## 3. Build and smoke-test

```bash
npx tsc --noEmit
BUILDX_BUILDER=<a docker-container builder from `docker buildx ls`> make x86
.claude/skills/update-upstream/smoke.sh
```

Docker Desktop is often not running on this machine: `open -ga Docker` and wait for
`docker version` to answer before building.

`smoke.sh` reads the pins from the working tree and runs, against a throwaway CouchDB
started with the package's own `00-startos.ini`, the same commands the package runs:
the unauthenticated `/_up` probe, `provision.ts`, the Setup URI generator in both modes
with the output patterns from `startos/utils.ts`, and two CLI mirrors that must carry a
note and then its deletion from one to the other. It needs nothing from the box and
leaves nothing behind. A failure prints the generator output or the daemon logs — that
is where a changed output format or CLI argument shows up. If the package's commands
change, change the script with them.

It does not cover the StartOS side: actions, the file models, init, backups, and the
plugin in Obsidian.

## 4. The one approval

Commit once on the branch (`Update Self-hosted LiveSync to <new>`, the body saying what
changed upstream, why the package did or did not need to change, and what was verified).
Then show the user, in one message: the versions, the upstream changes that reach this
package, the verdict from step 1, the release notes (`en_US`), and the smoke result. Ask
once: *push, merge, release to the registry, and update the box?*

Nothing leaves this machine before a yes. The update on the box cannot be undone
(`down: IMPOSSIBLE`), and the box holds the real vaults. After the yes, carry on to the
end without asking again, unless a check fails or something contradicts what was approved.

## 5. Pull request, merge, release

1. `git push -u origin ok/upstream-<new>` and `gh pr create --base main`: a lead
   paragraph, the pins that moved, the verdict, and a test plan saying what was and was
   not verified.
2. Wait for Build: `gh pr checks --watch`. Don't merge past a red check; read
   `gh run view --log-failed`, fix on the branch or re-run a flake, and say which.
3. `gh pr merge --squash --delete-branch` (a feature branch; `--merge` is for `next`).
4. Tag and Release runs on the push to `main`. Find its run
   (`gh run list -w "Tag and Release" -L 1`) and wait with
   `gh run watch <id> --exit-status` in the background. Never poll in a loop. Then
   confirm the registry serves `<new>:0` with the command from step 0, and that Sync
   next carried `main` onto `next`.

## 6. Update the box and verify

The box takes the package from the registry: `start-cli package install
obsidian-livesync <new>:0`, or the update offered in the StartOS UI.

If the install answers `Invalid Signature: … Signer(s) not accepted`, the box does not
list the release's signing key under **System → Trusted Keys**. Do not add `--trust`
on your own: whether the box trusts a key is the user's decision. Stop, say which key
signed the release, and offer the three ways on: add that key to Trusted Keys once,
update from the StartOS UI and confirm the warning there, or the user running the
install with `--trust` themselves.

The signer is the key CI packs with, the repo's `DEV_KEY` secret. Since 1.0.52:0 that
is the key shared with `mirall-relay-startos`, registered on the registry as
`mirall-relay CI`: `MCowBQYDK2VwAyEAHZRC+20XBAnpLPN3Tp+8d6keBnGPUwsPbKP5mrzJ39s=`
(private half: `~/.startos/ci-mirall-relay.key.pem`). 1.0.50:0 and 1.0.52:0 themselves
carry an older key that no longer exists anywhere. It is not `start-cli pubkey` (the
start-cli identity, which administers the registry) and not the workspace's
`.startos/build.key.pem`. To confirm it is
still the one, look for its last 32 bytes in the head of the released package:

```bash
curl -fsSL -r 0-255 https://github.com/ok/obsidian-livesync-startos/releases/download/v<new>_0/obsidian-livesync_x86_64.s9pk | xxd -p | tr -d '\n' \
  | grep -c "$(echo '<base64 key>' | base64 -d | tail -c 32 | xxd -p | tr -d '\n')"
```

Give the service a minute, then verify against the running service — an install that succeeded is not a
service that works:

- `start-cli package installed-version obsidian-livesync` is `"<new>:0"`.
- The status query from step 0: `started` is after the update, and every `health` entry
  is `success` (`couchdb`, plus `mirror` when one is configured).
- `start-cli package logs obsidian-livesync -l 200` shows a clean start.
- The vaults are still there and the admin password still works: `_all_dbs` through
  `start-cli package attach obsidian-livesync -n couchdb -- curl -fsS -u admin:… http://127.0.0.1:5984/_all_dbs`
  lists the same databases as before. Ask the user for nothing they would have to look
  up; if the password is not at hand, say this check was skipped.
- With a mirror configured: a file changed on a device appears under the mirror, or the
  mirror's log shows it replicating.

Never run **Set Vault Mirror**, delete anything under the `mirror` volume, or rewrite
`local.ini` as part of verifying: see `AGENTS.md`.

Report what was checked and what was not. That a device running Obsidian still syncs
is the user's check unless you saw it.
