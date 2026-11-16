export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Obsidian LiveSync...': 0,
  'Sync Server': 1,
  'CouchDB is accepting connections': 2,
  'CouchDB is not responding': 3,
  'Vault Mirror': 4,
  'Mirroring the vault in ${database}': 5,
  'The database ${database} does not exist. Create the vault with Create Setup URI, or correct the name in Set Vault Mirror.': 6,
  'The vault mirror cannot reach the sync server': 7,
  // interfaces.ts
  'The CouchDB address the Self-hosted LiveSync plugin syncs through': 8,
  Fauxton: 9,
  'The CouchDB web admin, for inspecting databases and documents': 10,
  // utils.ts
  'The Setup URI generator did not return a Setup URI and an ID recovery code.': 11,
  // init/watchCredentials.ts
  'Set the admin password before the sync server can start': 12,
  // actions/setAdminPassword.ts
  'Set Admin Password': 13,
  'Generate a new random password for the CouchDB admin account. Replaces any existing password.': 14,
  'Replaces the current admin password. Every device syncing with this server must be given the new one.': 15,
  'CouchDB Admin Credentials': 16,
  'LiveSync signs in to this server with these credentials, and so do you in Fauxton. Setup URIs created from now on carry them.': 17,
  Username: 18,
  Password: 19,
  // actions/createSetupUri.ts
  'Server Address': 20,
  'The address your devices will sync through; it is written into the Setup URI. Phones and tablets need an HTTPS address whose certificate they already trust, such as a public domain.': 21,
  'Database Name': 22,
  'The database that holds this vault. Use a new name for a new vault, or the name of an existing vault together with its ID recovery code.': 23,
  'Must begin with a lower-case letter and contain only lower-case letters, digits, and _ $ ( ) + -': 24,
  'Vault Encryption Passphrase': 25,
  'Encrypts the vault end to end before it leaves a device. Keep the generated one for a new vault, or enter the passphrase an existing vault already uses.': 26,
  'ID Recovery Code': 27,
  'Leave empty to create a new vault. To create another Setup URI for an existing vault, enter the ID recovery code shown when that vault was created.': 28,
  'Must be an ID recovery code, which begins with sls-id-v1:': 29,
  'Create Setup URI': 30,
  'Create a vault on this server and the Setup URI that connects Obsidian to it, or another Setup URI for a vault that already exists.': 31,
  'Run Set Admin Password first.': 32,
  'The database ${database} already holds a vault. Enter its ID recovery code to create another Setup URI for it, or choose a different database name.': 33,
  'Setup URI': 34,
  'In Obsidian, install and enable the Self-hosted LiveSync plugin, choose to set up with a Setup URI, then enter the Setup URI and the Setup URI passphrase below.': 35,
  'This Setup URI can be opened until ${expires} (UTC). After that, run this action again with the same database name, encryption passphrase and ID recovery code.': 36,
  'Save the vault encryption passphrase and the ID recovery code now. They are not stored on this server and cannot be shown again.': 37,
  'Setup URI Passphrase': 38,
  'Unlocks the Setup URI when Obsidian opens it.': 39,
  'Encrypts the vault end to end. Without it the vault cannot be read.': 40,
  'Needed to create another Setup URI for this vault, or to mirror it on this server.': 41,
  // actions/setVaultMirror.ts
  'Mirror a Vault': 42,
  'Keep a copy of one vault on this server as ordinary files. Turning this off deletes that copy; the vault itself and your devices are not affected.': 43,
  'The database of the vault to mirror.': 44,
  'The passphrase shown when the vault was created. It is stored on this server so the mirror can decrypt the vault.': 45,
  'The ID recovery code shown when the vault was created.': 46,
  'Set Vault Mirror': 47,
  'Keep an unencrypted copy of one vault on this server as ordinary files, so it is included in backups in readable form. Off by default.': 48,
  'Mirroring a vault needs its database name, its encryption passphrase and its ID recovery code.': 49,
  // actions/compactDatabases.ts
  'Compact Databases': 50,
  'Free disk space by compacting every database. CouchDB keeps the old versions of each note on disk until it compacts, so a vault that is edited often keeps growing.': 51,
  'Permanently discards the stored contents of old document revisions in every database. Compaction runs in the background while syncing continues; large vaults can take several minutes.': 52,
  'Could not list the databases (HTTP ${status}).': 53,
  'Compaction Started': 54,
  'Compaction started for ${count} database(s) and continues in the background.': 55,
  'Compaction could not be started for: ${databases}': 56,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
