import { utils } from '@start9labs/start-sdk'
import { localIni, withAdmin } from '../fileModels/local.ini'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { adminUsername, applyMirrorSettings } from '../utils'

export const setAdminPassword = sdk.Action.withoutInput(
  'set-admin-password',

  async ({ effects }) => ({
    name: i18n('Set Admin Password'),
    description: i18n(
      'Generate a new random password for the CouchDB admin account. Replaces any existing password.',
    ),
    warning: (await storeJson.read((s) => s.adminPassword).const(effects))
      ? i18n(
          'Replaces the current admin password. Every device syncing with this server must be given the new one.',
        )
      : null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const adminPassword = utils.getDefaultString({
      charset: 'a-z,A-Z,0-9',
      len: 32,
    })
    await localIni.write(
      effects,
      withAdmin((await localIni.read().once()) ?? '', adminPassword),
    )
    const mirror = await storeJson.read((s) => s.mirror).once()
    if (mirror) await applyMirrorSettings(effects, adminPassword, mirror)
    await storeJson.merge(effects, { adminPassword })

    return {
      version: '1',
      title: i18n('CouchDB Admin Credentials'),
      message: i18n(
        'LiveSync signs in to this server with these credentials, and so do you in Fauxton. Setup URIs created from now on carry them.',
      ),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Username'),
            description: null,
            value: adminUsername,
            masked: false,
            copyable: true,
            qr: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Password'),
            description: null,
            value: adminPassword,
            masked: true,
            copyable: true,
            qr: false,
            launchable: false,
          },
        ],
      },
    }
  },
)
