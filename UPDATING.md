# Updating the upstream version

This package pins four upstream sources. The package version follows Self-hosted LiveSync.

| Source               | What it is                                                                 | Pinned at                                                        |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Self-hosted LiveSync | Git submodule `obsidian-livesync/`, whose `utils/` the `Dockerfile` copies | The submodule commit                                             |
| LiveSync CLI         | Published image `ghcr.io/vrtmrz/livesync-cli`                              | `images.cli.source.dockerTag` in `startos/manifest/index.ts`     |
| CouchDB              | Docker official image `couchdb`                                            | `images.couchdb.source.dockerTag` in `startos/manifest/index.ts` |
| Deno                 | Base image `denoland/deno`                                                 | `FROM` in `Dockerfile`                                           |

## Determining the upstream version

### Self-hosted LiveSync and its CLI

```
gh release view -R vrtmrz/obsidian-livesync --json tagName -q .tagName
```

The CLI image for release `X.Y.Z` is tagged `X.Y.Z-cli`. It is published by a separate workflow and can lag the release or be skipped for one, so confirm the tag exists before bumping:

```
TOKEN=$(curl -fsSL "https://ghcr.io/token?scope=repository:vrtmrz/livesync-cli:pull" | jq -r .token)
curl -fsSL -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/vrtmrz/livesync-cli/tags/list?n=1000" | jq -r '.tags[]' | grep -E '^[0-9.]+-cli$' | sort -V | tail -5
```

Upstream releases several times a week, mostly plugin changes. A release matters here when it touches `utils/`, `src/apps/cli/`, or the database or Setup URI formats; read `updates.md` in the upstream repo.

### CouchDB

```
curl -fsSL "https://hub.docker.com/v2/repositories/library/couchdb/tags?page_size=25&ordering=last_updated" | jq -r '.results[].name'
```

Use the plain `X.Y.Z` tag, or a four-part `X.Y.Z.N` rebuild of it. Never a `-nouveau` tag: that variant bundles the Nouveau search service, which this package does not run. Read <https://docs.couchdb.org/en/stable/whatsnew/> first; a minor release can change defaults that `00-startos.ini` sets.

### Deno

```
curl -fsSL "https://hub.docker.com/v2/repositories/denoland/deno/tags?page_size=50&ordering=last_updated" | jq -r '.results[].name' | grep -E '^debian-[0-9.]+$' | head -5
```

Upstream's tools require Deno 2.

## Applying the bump

### Self-hosted LiveSync and its CLI

Move both to the same release:

1. `git -C obsidian-livesync fetch --tags && git -C obsidian-livesync checkout <X.Y.Z>`, then `git add obsidian-livesync`. Upstream tags have no `v` prefix.
2. Set `images.cli.source.dockerTag` to `ghcr.io/vrtmrz/livesync-cli:<X.Y.Z>-cli`.
3. Check that the `Dockerfile` still matches upstream's own invocation of the tools: the config and lock paths (`utils/flyio/deno.jsonc`, `utils/flyio/deno.lock`) and the two entry scripts, as `utils/couchdb/couchdb-init.sh` and `utils/readme.md` give them. The same paths are in `startos/utils.ts`.
4. Check that `startos/fileModels/startos.ini.ts` still lists every setting `utils/couchdb/provision.ts` applies.

### CouchDB

Set `images.couchdb.source.dockerTag` to `couchdb:<tag>`.

### Deno

Set the `FROM` tag in `Dockerfile` to `denoland/deno:debian-<X.Y.Z>`.
