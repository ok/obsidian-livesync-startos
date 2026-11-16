# Obsidian LiveSync

The sync itself is done by the **Self-hosted LiveSync** plugin inside Obsidian, which you install on each device. This service is the server those devices sync through.

## Documentation

- [LiveSync quick setup](https://github.com/vrtmrz/obsidian-livesync/blob/main/docs/quick_setup.md) — setting up the first device from a Setup URI and adding further devices.
- [LiveSync settings](https://github.com/vrtmrz/obsidian-livesync/blob/main/docs/settings.md) — what each plugin setting does.
- [LiveSync troubleshooting](https://github.com/vrtmrz/obsidian-livesync/blob/main/docs/troubleshooting.md) — fixing sync and connection problems.
- [LiveSync recovery](https://github.com/vrtmrz/obsidian-livesync/blob/main/docs/recovery.md) — choosing which copy wins and resetting sync on a device.
- [Apache CouchDB documentation](https://docs.couchdb.org/en/stable/*) — the database behind the server, including Fauxton.

## What you get on StartOS

A private sync server for your Obsidian vaults, already configured for LiveSync, with two interfaces:

- **Sync Server** — the address your devices sync through.
- **Fauxton** — the database's web admin, for looking at what is stored.

You also get a **Create Setup URI** action, which creates a vault on the server and hands you a link that configures the plugin in one step, and an optional copy of one vault kept on the server as ordinary files.

## Getting set up

1. Run the **Set Admin Password** task. Copy the password it shows and keep it somewhere safe — it is shown only once. The username is always `admin`.
2. Start the service.
3. Decide which **Sync Server** address your devices will use. A computer can use any of them. A phone or tablet only connects over HTTPS with a certificate it already trusts, so for mobile add a public domain to the **Sync Server** interface first and use that address.
4. Run **Create Setup URI**. Choose that address, keep the suggested database name or pick your own, and keep the generated encryption passphrase.
5. Save everything the action shows you in a password manager. The **vault encryption passphrase** and the **ID recovery code** are not kept on the server and cannot be shown again; without the passphrase the vault cannot be read.
6. On your first device, open Obsidian, go to **Settings → Community plugins**, and install and enable **Self-hosted LiveSync**.
7. In the plugin's setup, choose to set up with a Setup URI. Paste the **Setup URI**, or scan its QR code with a phone, then enter the **Setup URI passphrase** and follow the prompts.

The Setup URI stops working after the time the action shows, which can be less than a day away. If it has expired, run **Create Setup URI** again with the same database name, the same encryption passphrase and the ID recovery code.

## Using Obsidian LiveSync

### Adding more devices

Install and enable the plugin on the new device, then give it a Setup URI for the same vault. You can make one on a device that already syncs, with the plugin's **Copy settings as a new Setup URI** command, or run **Create Setup URI** again with the vault's database name, encryption passphrase and ID recovery code.

### More than one vault

Run **Create Setup URI** once per vault, with a different database name each time and the ID recovery code left empty.

### Fauxton

Opening Fauxton asks for a username and password — use `admin` and your admin password. It lists one database per vault, with its size. The notes inside are encrypted, so there is nothing readable to browse.

### Actions

- **Set Admin Password** — replaces the admin password. Run it if the password has been exposed or lost. Afterwards every device needs the new one; the simplest way is a new Setup URI from **Create Setup URI**, using the vault's ID recovery code.
- **Create Setup URI** — creates a new vault, or another Setup URI for a vault you already have.
- **Set Vault Mirror** — keeps a copy of one vault on this server as ordinary, readable files, so your backups contain your notes in a form you can open without Obsidian. It needs the vault's database name, encryption passphrase and ID recovery code, and stores the passphrase on the server. Turning it off deletes that copy and nothing else.
- **Compact Databases** — frees disk space. The server keeps old versions of every note until it compacts, and LiveSync saves a new version on every edit, so a vault grows over time. Run this now and then; it asks you to confirm first, because the old versions it clears cannot be recovered.

## Limitations

- Restoring a backup brings back the admin password that was in use when the backup was taken. If you changed it since, give your devices a new Setup URI or run **Set Admin Password** again.
- The vault mirror is a live copy, not an export. Changing or deleting its files on the server changes or deletes the notes on every device.
