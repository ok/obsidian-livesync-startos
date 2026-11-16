# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

## This repo

- **Never write `local.ini` wholesale.** It is the last file in CouchDB's config chain, so CouchDB keeps the hashed admin password and the server `uuid` there; regenerating it re-rolls both. Package-owned settings go in `00-startos.ini`, which must keep sorting before it.
- **Never delete or rewrite files under the `mirror` volume while the service can be running.** The mirror is a two-way LiveSync client: a deletion it sees is synced to every device. `set-vault-mirror` is `only-stopped` for that reason, and must stay so.
- **Don't parse or patch `mirror/settings.json`, and don't reimplement upstream's tools.** The settings format is the LiveSync client's and moves with upstream: change it by generating a Setup URI and having the client import it (`applyMirrorSettings` in `startos/utils.ts`). Provisioning and Setup URI generation run upstream's own scripts from the `obsidian-livesync/` submodule; the package only passes them environment variables and reads the generator's printed output, so that output is the thing to check on a bump.
- The `setup` image is built with Buildx's OCI exporter. If `make` fails with "OCI exporter is not supported for the docker driver", run it as `BUILDX_BUILDER=<a docker-container builder> make`.
