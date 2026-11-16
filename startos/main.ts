import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  adminHeaders,
  couchdbMounts,
  couchdbPort,
  couchdbUrl,
  mirrorCli,
  mirrorMounts,
} from './utils'

// Exits non-zero unless the mirrored database exists. Runs in the mirror's
// container, where Node is the only HTTP client.
const databaseExists = [
  'fetch(process.env.MIRROR_DATABASE_URL,',
  '{headers:{Authorization:process.env.MIRROR_AUTHORIZATION}})',
  '.then((r)=>{if(!r.ok){',
  'console.error("[Mirror] The database to mirror was not found (HTTP "+r.status+")");',
  'process.exit(1)}})',
  '.catch((e)=>{console.error("[Mirror] "+e.message);process.exit(1)})',
].join('')

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Obsidian LiveSync...'))

  const store = await storeJson.read().const(effects)

  const daemons = sdk.Daemons.of(effects).addDaemon('couchdb', {
    subcontainer: sdk.SubContainer.of(
      effects,
      { imageId: 'couchdb' },
      couchdbMounts,
      'couchdb',
    ),
    exec: {
      command: sdk.useEntrypoint(),
      // The image's entrypoint is tini, which must be PID 1.
      runAsInit: true,
    },
    ready: {
      display: i18n('Sync Server'),
      fn: () =>
        sdk.healthCheck.checkWebUrl(
          effects,
          `http://localhost:${couchdbPort}/_up`,
          {
            successMessage: i18n('CouchDB is accepting connections'),
            errorMessage: i18n('CouchDB is not responding'),
          },
        ),
    },
    requires: [],
  })

  const mirror = store?.mirror
  if (!mirror) return daemons

  return daemons.addDaemon('mirror', {
    subcontainer: sdk.SubContainer.of(
      effects,
      { imageId: 'cli' },
      mirrorMounts,
      'mirror',
    ),
    exec: {
      // LiveSync creates a database that does not exist, so a mistyped name
      // would silently mirror a new, empty vault. Refuse to start instead.
      command: [
        'sh',
        '-c',
        `node -e '${databaseExists}' && exec "$@"`,
        'mirror',
        ...mirrorCli('--vault', '/mirror/vault', 'daemon'),
      ],
      env: {
        MIRROR_DATABASE_URL: `${couchdbUrl}/${encodeURIComponent(mirror.database)}`,
        MIRROR_AUTHORIZATION: adminHeaders(store.adminPassword ?? '')
          .Authorization,
      },
    },
    ready: {
      display: i18n('Vault Mirror'),
      // The mirror listens on no port, so readiness is whether the vault it
      // mirrors exists on the server. StartOS itself reports the daemon
      // crashing, which is what a wrong passphrase looks like.
      fn: async () => {
        const res = await fetch(
          `${couchdbUrl}/${encodeURIComponent(mirror.database)}`,
          { headers: adminHeaders(store.adminPassword ?? '') },
        ).catch(() => null)
        if (res?.ok) {
          return {
            result: 'success',
            message: i18n('Mirroring the vault in ${database}', {
              database: mirror.database,
            }),
          }
        }
        return {
          result: 'failure',
          message:
            res?.status === 404
              ? i18n(
                  'The database ${database} does not exist. Create the vault with Create Setup URI, or correct the name in Set Vault Mirror.',
                  { database: mirror.database },
                )
              : i18n('The vault mirror cannot reach the sync server'),
        }
      },
    },
    requires: ['couchdb'],
  })
})
