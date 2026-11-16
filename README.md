<p align="center">
  <img src="icon.webp" alt="Obsidian LiveSync Logo" width="21%">
</p>

# Obsidian LiveSync on StartOS

> Everything not listed in this document should behave the same as upstream
> Self-hosted LiveSync. If a feature, setting, or behavior is not mentioned here,
> the upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) is an Obsidian community plugin that syncs vaults through a server the user runs. The plugin itself is installed inside Obsidian on each device; this package is the server side: a CouchDB configured the way upstream's provisioning tool configures it, upstream's Setup URI generator exposed as an action, and an optional headless LiveSync client that keeps a plain-file copy of one vault on the server.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

The package uses three images: two published ones run unmodified, and one built here to carry upstream's command-line tools.

| Image     | Source                                                                               | Used for                                       |
| --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `couchdb` | Docker official image `couchdb`, unmodified                                          | The sync server                                |
| `cli`     | Upstream's `ghcr.io/vrtmrz/livesync-cli`, unmodified                                 | The vault mirror                               |
| `setup`   | Built from this repo's `Dockerfile`: a Deno image plus upstream's `utils/` directory | Database provisioning and Setup URI generation |

All three are built for x86_64 and aarch64. The `setup` image caches the tools' npm dependencies at build time and runs them with `--cached-only`, so no action needs internet access.

| Subcontainer | Runs                                                                       | Lifetime                                                 |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `couchdb`    | The image's own entrypoint (`tini`, then `docker-entrypoint.sh`), as PID 1 | While the service runs                                   |
| `mirror`     | `livesync-cli … daemon`, after a check that the mirrored database exists   | While the service runs, only when a mirror is configured |

Actions additionally start short-lived subcontainers from `setup` and `cli` and remove them when they finish.

## Volume and Data Layout

Three volumes: CouchDB's databases, CouchDB's configuration overrides, and the vault mirror.

| Volume   | Mount point                             | Contents                                                                                                                   |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `main`   | `/opt/couchdb/data` in `couchdb`        | Database and shard files, plus the package's `store.json`                                                                  |
| `config` | `/opt/couchdb/etc/local.d` in `couchdb` | `00-startos.ini`, `local.ini`, and the empty `docker.ini` the entrypoint touches                                           |
| `mirror` | `/mirror` in `mirror`                   | `vault/` (the mirrored notes as plain files), `db/` (the client's local database), `settings.json` (the client's settings) |

The `mirror` volume is empty unless a mirror is configured. Each vault is one CouchDB database; there is no other database.

## File Models

The package owns one CouchDB configuration file outright, shares another with CouchDB, and keeps a small store of its own. CouchDB reads every `.ini` in `local.d` in name order, later files overriding earlier ones, and writes any runtime configuration change to the last one.

| File                    | Owner           | Written                                                                                              |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `config/00-startos.ini` | Package         | Rewritten in full on every init (install, update, restore, container rebuild)                        |
| `config/local.ini`      | CouchDB, shared | Package sets `[admins] admin` from **Set Admin Password**; CouchDB writes everything else            |
| `main/store.json`       | Package         | `adminPassword` and `mirror`, written by actions                                                     |
| `mirror/settings.json`  | LiveSync client | Written by the client's own `setup` command when **Set Vault Mirror** or **Set Admin Password** runs |

- **`00-startos.ini`** holds the server settings upstream's provisioning tool applies: single-node mode, the listener on port 5984, authentication required on every request except `GET /_up`, CORS for `app://obsidian.md`, `capacitor://localhost` and `http://localhost`, a basic-auth browser prompt, a 50 MB document limit and a 4 GB request limit. A hand edit is lost at the next init.
- **`local.ini`** is where CouchDB keeps the hashed admin password, the server `uuid`, and any change made through Fauxton or the `_config` API. **Create Setup URI** runs upstream's provisioning tool, which sets the same values as `00-startos.ini` through the `_config` API, so they also appear here after the first vault is created. Because this file loads last, a key overridden here wins over `00-startos.ini` and survives restarts and updates.
- **`store.json`** holds the admin password in plaintext, so actions and the mirror can authenticate, and, while a mirror is configured, that vault's database name, encryption passphrase and ID recovery code. It is package state, not upstream configuration.
- **`settings.json`** is the LiveSync client's settings file in its own format, including the admin password and the vault's encryption passphrase. The package never edits it directly; it generates a Setup URI pointing at `http://127.0.0.1:5984` and has the client import it.

No environment variables configure CouchDB; `COUCHDB_USER` and `COUCHDB_PASSWORD` are deliberately unused, since the entrypoint applies them only when no admin exists yet.

## Dependencies

None.

## Network Access and Interfaces

Both interfaces are served by the one CouchDB listener on port 5984 over HTTP and share one set of addresses.

| Interface   | ID    | Type | Port | Path       | Purpose                                                   |
| ----------- | ----- | ---- | ---- | ---------- | --------------------------------------------------------- |
| Sync Server | `api` | api  | 5984 | `/`        | The address the Self-hosted LiveSync plugin syncs through |
| Fauxton     | `ui`  | ui   | 5984 | `/_utils/` | CouchDB's built-in web admin                              |

Every request except `GET /_up` needs the admin credentials; an unauthenticated browser gets a basic-auth prompt. The service starts no outbound connections.

Obsidian on iOS and Android only connects over HTTPS with a certificate the device's operating system trusts, so a phone needs an address that has one, such as a public domain with a publicly issued certificate. Desktop Obsidian has no such restriction.

## Installation and First-Run Flow

Install creates no credentials and cannot start the service on its own.

1. Install writes `00-startos.ini` and raises the critical **Set Admin Password** task; the service stays stopped.
2. Running the task's action generates the admin password, writes it to `local.ini` and `store.json`, and returns username `admin` and the password. The task clears.
3. On the first start CouchDB hashes the password in place, creates its system databases (`_users`, `_replicator`) and writes its `uuid`. One `_users database does not exist` error appears in the log during this first start and is harmless.
4. No vault exists yet. **Create Setup URI** creates one and returns what Obsidian needs to connect.

Upstream's flow of running `couchdb-init.sh` and then the Setup URI generator by hand is replaced by steps 2 and 4.

## Actions

Four user-facing actions; there are no hidden actions.

- **Set Admin Password** (`set-admin-password`) — run on first install, as the critical task, and whenever the admin password must change. It generates a new 32-character password, writes it to `local.ini` and `store.json`, re-imports the mirror's settings with it if a mirror is configured, and returns it once; it cannot be shown again except by running the action again. Every device then needs the new password: the old one is rejected as soon as the service starts, and a device is updated most easily with a new Setup URI. Safe to repeat. Databases, the server `uuid` and vault contents are untouched.
- **Create Setup URI** (`create-setup-uri`) — run once per new vault, and again whenever another Setup URI is needed for an existing vault. It runs upstream's provisioning tool, which creates the database if missing and writes LiveSync's version document, then upstream's Setup URI generator. It returns the Setup URI (also as a QR code), the Setup URI passphrase, the vault encryption passphrase and the ID recovery code. Takes a few seconds and does not interrupt syncing.
  - With no ID recovery code, the generator creates a fresh ID key: the result is a Setup URI for a **new** vault. The action refuses if the database already holds more than LiveSync's version document, because a second ID key on an existing vault would not match its devices.
  - With the vault's ID recovery code and the same encryption passphrase, the result is another Setup URI for the **same** vault. This is how an expired Setup URI is replaced and how devices get new credentials after a password change.
  - The Setup URI is time-limited: it can be opened until the end of upstream's current fixed seven-day UTC window, which can be less than a day away. The action reports the exact time. Expiry only stops the URI being opened; a device already set up keeps syncing.
  - The encryption passphrase and ID recovery code are returned once and are not stored unless the vault is mirrored.
- **Set Vault Mirror** (`set-vault-mirror`) — run to start or stop keeping a plain-file copy of one vault on the server. Enabling needs the vault's database name, encryption passphrase and ID recovery code; the package stores them in `store.json`, clears the `mirror` volume if the target vault changed, and imports settings into the LiveSync client. Disabling deletes everything in the `mirror` volume and removes the stored passphrase and code; the vault on the server and on every device is untouched, because the service is stopped while this runs. Only one vault can be mirrored. Safe to repeat. The mirror starts with the service, and its first sync of a large vault can take minutes.
- **Compact Databases** (`compact-databases`) — run when disk usage is high, especially after heavy editing or a LiveSync cleanup or rebuild. It starts compaction of every database, system databases included, and returns their names. Compaction permanently discards the stored contents of old document revisions, continues in the background after the action returns, and does not interrupt syncing. Safe to repeat.

## Tasks

The package raises one task.

- **Set Admin Password** — `critical`. Raised on any init while `store.json` has no admin password: a fresh install, or a store that has been lost. It blocks the service from starting. Running **Set Admin Password** clears it; it does not return once a password is stored.

## Health Checks

One check per daemon; the second exists only while a mirror is configured.

| Check     | Probes                                                    | Failure means                                                                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `couchdb` | `GET http://localhost:5984/_up`                           | CouchDB is not serving HTTP. Connection-refused during the first few seconds after a start is normal. If it persists, read the log: the entrypoint exits with an "Admin Party" error when `local.ini` has lost its `[admins]` entry — run **Set Admin Password**. |
| `mirror`  | `GET` on the mirrored database with the admin credentials | See below.                                                                                                                                                                                                                                                        |

A `mirror` failure has three causes, told apart by its message:

- **The database does not exist** — the name given to **Set Vault Mirror** matches no vault. The mirror refuses to start, so that it does not create an empty database under that name, and logs `[Mirror] The database to mirror was not found`. Create the vault with **Create Setup URI** or correct the name.
- **`mirror daemon crashed`** — the LiveSync client started and exited. The usual cause is an encryption passphrase or ID recovery code that does not belong to the vault: the service log then shows `[Daemon] Initial replication failed, cannot continue`. The vault on the server is not modified. Run **Set Vault Mirror** again with the right values.
- **Cannot reach the sync server** — CouchDB is down; see the `couchdb` check.

The `mirror` check passing means the database exists and the client is running, not that it has finished syncing a large vault.

## Backups and Restore

All three volumes are copied wholesale (`ofVolumes('main', 'config', 'mirror')`): every database, `local.ini` with the hashed admin password, `store.json`, and the mirror's files, local database and settings.

Vaults on the server are stored encrypted with each vault's passphrase, which the backup contains only for a mirrored vault. The mirrored vault's notes are in the backup as readable files.

A restored instance comes back with the admin password that was current when the backup was taken, and starts without a task. If the password was changed after that backup, devices set up with the newer one need a new Setup URI, or **Set Admin Password** run again. Devices that synced after the backup hold newer notes than the restored server; upstream's recovery guide covers choosing which copy wins.

## Limitations and Differences

1. Server-side only. The Self-hosted LiveSync plugin still has to be installed and enabled inside Obsidian on every device.
2. CouchDB is the only remote. Upstream's Object Storage and peer-to-peer modes need no server from this package and are not set up by it; no signalling relay, TURN server, WebPeer or WebApp is included.
3. Single CouchDB node; clustering and the `_cluster_setup` flow are not available.
4. Every device signs in as the CouchDB admin, as in upstream's own setup. The admin username is always `admin`. Additional users can be created through Fauxton as upstream CouchDB documents, but Setup URIs from this package always carry the admin credentials.
5. Setup URIs from **Create Setup URI** are always time-limited; upstream's non-expiring mode is not offered.
6. One vault can be mirrored at a time.
7. The mirror is a full two-way LiveSync client, not a read-only export: a file changed or deleted in `mirror/vault` while the service runs syncs to every device.
8. CORS allows only the Obsidian desktop and mobile origins and `http://localhost`. A browser-based client on another origin needs its origin added to `[cors] origins` through Fauxton's configuration page.

---

## Quick Reference for AI Consumers

```yaml
package_id: obsidian-livesync
image: couchdb
additional_images:
  - ghcr.io/vrtmrz/livesync-cli
  - setup (built from Dockerfile)
architectures: [x86_64, aarch64]
subcontainers: [couchdb, mirror]
volumes:
  main: /opt/couchdb/data
  config: /opt/couchdb/etc/local.d
  mirror: /mirror
file_models:
  - config/00-startos.ini
  - config/local.ini
  - main/store.json
startos_managed_env_vars: []
dependencies: none
interfaces:
  api: { type: api, port: 5984 }
  ui: { type: ui, port: 5984 }
actions:
  - set-admin-password
  - create-setup-uri
  - set-vault-mirror
  - compact-databases
tasks:
  - { action: set-admin-password, severity: critical }
health_checks:
  - couchdb
  - mirror
```
