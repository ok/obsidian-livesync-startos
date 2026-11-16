import { T, utils } from '@start9labs/start-sdk'
import { Mirror } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const couchdbPort = 5984
export const couchdbUrl = `http://127.0.0.1:${couchdbPort}`
export const adminUsername = 'admin'

// What upstream's provisioning tool accepts as a database name.
export const databaseNamePattern = '[a-z][a-z0-9_$()+-]*'

export const couchdbMounts = sdk.Mounts.of()
  .mountVolume({
    volumeId: 'main',
    subpath: null,
    mountpoint: '/opt/couchdb/data',
    readonly: false,
  })
  .mountVolume({
    volumeId: 'config',
    subpath: null,
    mountpoint: '/opt/couchdb/etc/local.d',
    readonly: false,
  })

export const mirrorMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'mirror',
  subpath: null,
  mountpoint: '/mirror',
  readonly: false,
})

const mirrorSettings = '/mirror/settings.json'

// livesync-cli <database-path> --settings <file> <command...>
export const mirrorCli = (...command: string[]): [string, ...string[]] => [
  'node',
  '/app/dist/index.cjs',
  '/mirror/db',
  '--settings',
  mirrorSettings,
  ...command,
]

export const adminHeaders = (password: string) => ({
  Authorization:
    'Basic ' + Buffer.from(`${adminUsername}:${password}`).toString('base64'),
  'Content-Type': 'application/json',
})

// Runs one of upstream's Deno tools from the `setup` image, whose dependencies
// are cached at build time.
const setupTool = (script: string, ...permissions: string[]) => [
  'deno',
  'run',
  '--cached-only',
  '--config=utils/flyio/deno.jsonc',
  '--frozen',
  '--lock=utils/flyio/deno.lock',
  ...permissions,
  script,
]

const setupToolOptions = (env: Record<string, string>) => ({
  cwd: '/opt/livesync',
  env: { DENO_DIR: '/opt/deno-cache', NO_COLOR: '1', ...env },
  timeout: 120_000,
})

/**
 * Creates `database` if it is missing and writes LiveSync's database-version
 * document into it, using upstream's provisioning tool. Needs CouchDB running.
 */
export async function provisionDatabase(
  effects: T.Effects,
  password: string,
  database: string,
) {
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'setup' },
    null,
    'provision',
    (sub) =>
      sub.execFail(
        setupTool('utils/couchdb/provision.ts', '--allow-env', '--allow-net'),
        setupToolOptions({
          hostname: couchdbUrl,
          username: adminUsername,
          password,
          database,
          retry_count: '3',
          retry_delay_ms: '2000',
        }),
      ),
  )
}

export type SetupUri = {
  setupUri: string
  idRecoveryCode: string
  /** ISO timestamp after which the URI can no longer be opened; null if it never expires */
  expires: string | null
}

/**
 * Generates a Setup URI with upstream's generator. Without `idRecoveryCode`
 * the generator creates a fresh ID key, which makes the URI one for a new
 * vault; with it, the URI joins the vault that code belongs to.
 */
export async function generateSetupUri(
  effects: T.Effects,
  options: {
    host: string
    password: string
    database: string
    passphrase: string
    uriPassphrase: string
    mode: 'ephemeral' | 'persistent'
    idRecoveryCode: string | null
  },
): Promise<SetupUri> {
  const { stdout } = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'setup' },
    null,
    'setup-uri',
    (sub) =>
      sub.execFail(
        setupTool('utils/setup/generate_setup_uri.ts', '--allow-env'),
        setupToolOptions({
          remote_type: 'couchdb',
          LIVESYNC_HOST: options.host,
          LIVESYNC_USER: adminUsername,
          LIVESYNC_PASS: options.password,
          LIVESYNC_DB: options.database,
          LIVESYNC_PASSPHRASE: options.passphrase,
          uri_passphrase: options.uriPassphrase,
          uri_mode: options.mode,
          ...(options.idRecoveryCode
            ? { id_recovery_code: options.idRecoveryCode }
            : {}),
        }),
      ),
  )
  const output = stdout.toString()
  const setupUri = output.match(/^obsidian:\/\/setuplivesync\?\S+$/m)?.[0]
  const idRecoveryCode = output.match(/sls-id-v1:[0-9a-f]{64}/)?.[0]
  if (!setupUri || !idRecoveryCode) {
    throw new Error(
      i18n(
        'The Setup URI generator did not return a Setup URI and an ID recovery code.',
      ),
    )
  }
  return {
    setupUri,
    idRecoveryCode,
    expires: output.match(/usable until (\S+Z)/)?.[1] ?? null,
  }
}

/**
 * Writes the vault mirror's settings file so it syncs `mirror` against the
 * local CouchDB with the given admin password. The service must be stopped.
 */
export async function applyMirrorSettings(
  effects: T.Effects,
  password: string,
  mirror: Mirror,
) {
  const uriPassphrase = utils.getDefaultString({
    charset: 'a-z,A-Z,0-9',
    len: 32,
  })
  const { setupUri } = await generateSetupUri(effects, {
    host: couchdbUrl,
    password,
    database: mirror.database,
    passphrase: mirror.passphrase,
    uriPassphrase,
    mode: 'persistent',
    idRecoveryCode: mirror.idRecoveryCode,
  })
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'cli' },
    mirrorMounts,
    'mirror-settings',
    async (sub) => {
      await sub.execFail(['mkdir', '-p', '/mirror/db', '/mirror/vault'])
      const exists = await sub.exec(['test', '-f', mirrorSettings])
      if (exists.exitCode !== 0) {
        await sub.execFail([
          'node',
          '/app/dist/index.cjs',
          'init-settings',
          mirrorSettings,
        ])
      }
      await sub.execFail(mirrorCli('setup', setupUri), {
        input: `${uriPassphrase}\n`,
        timeout: 120_000,
      })
    },
  )
}

/**
 * Deletes the mirror's files, local database and settings. The service must be
 * stopped: a running mirror would sync the deletions to every device.
 */
export async function wipeMirror(effects: T.Effects) {
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'cli' },
    mirrorMounts,
    'mirror-wipe',
    (sub) =>
      sub.execFail(['find', '/mirror', '-mindepth', '1', '-delete'], {
        timeout: null,
      }),
  )
}
