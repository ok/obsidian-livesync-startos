import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { adminHeaders, couchdbUrl } from '../utils'

export const compactDatabases = sdk.Action.withoutInput(
  'compact-databases',

  async () => ({
    name: i18n('Compact Databases'),
    description: i18n(
      'Free disk space by compacting every database. CouchDB keeps the old versions of each note on disk until it compacts, so a vault that is edited often keeps growing.',
    ),
    warning: i18n(
      'Permanently discards the stored contents of old document revisions in every database. Compaction runs in the background while syncing continues; large vaults can take several minutes.',
    ),
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  async () => {
    const password = await storeJson.read((s) => s.adminPassword).once()
    const headers = adminHeaders(password ?? '')

    const listed = await fetch(`${couchdbUrl}/_all_dbs`, { headers })
    if (!listed.ok) {
      throw new Error(
        i18n('Could not list the databases (HTTP ${status}).', {
          status: String(listed.status),
        }),
      )
    }

    const started: string[] = []
    const failed: string[] = []
    for (const db of (await listed.json()) as string[]) {
      const res = await fetch(
        `${couchdbUrl}/${encodeURIComponent(db)}/_compact`,
        { method: 'POST', headers },
      )
      ;(res.ok ? started : failed).push(db)
    }

    return {
      version: '1',
      title: i18n('Compaction Started'),
      message: [
        i18n(
          'Compaction started for ${count} database(s) and continues in the background.',
          { count: String(started.length) },
        ),
        failed.length
          ? i18n('Compaction could not be started for: ${databases}', {
              databases: failed.join(', '),
            })
          : null,
      ]
        .filter((line) => line !== null)
        .join('\n\n'),
      result: {
        type: 'single',
        value: started.join(', ') || '—',
        masked: false,
        copyable: false,
        qr: false,
        launchable: false,
      },
    }
  },
)
