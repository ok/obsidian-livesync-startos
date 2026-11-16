import { utils } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  adminHeaders,
  couchdbUrl,
  databaseNamePattern,
  generateSetupUri,
  provisionDatabase,
} from '../utils'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  address: Value.dynamicSelect(async ({ effects }) => {
    const host = await sdk.host.getOwn(effects, 'couchdb').once()
    const api = Object.values(host?.bindings ?? {})
      .flatMap((b) => Object.values(b.interfaces))
      .find((i) => i.id === 'api')
    const urls = (api?.addressInfo.nonLocal.format() ?? []).map((url) =>
      url.replace(/\/+$/, ''),
    )
    return {
      name: i18n('Server Address'),
      description: i18n(
        'The address your devices will sync through; it is written into the Setup URI. Phones and tablets need an HTTPS address whose certificate they already trust, such as a public domain.',
      ),
      default: null,
      values: Object.fromEntries(urls.map((url) => [url, url])),
    }
  }),
  database: Value.text({
    name: i18n('Database Name'),
    description: i18n(
      'The database that holds this vault. Use a new name for a new vault, or the name of an existing vault together with its ID recovery code.',
    ),
    required: true,
    default: 'obsidian',
    patterns: [
      {
        regex: databaseNamePattern,
        description: i18n(
          'Must begin with a lower-case letter and contain only lower-case letters, digits, and _ $ ( ) + -',
        ),
      },
    ],
  }),
  passphrase: Value.text({
    name: i18n('Vault Encryption Passphrase'),
    description: i18n(
      'Encrypts the vault end to end before it leaves a device. Keep the generated one for a new vault, or enter the passphrase an existing vault already uses.',
    ),
    required: true,
    masked: true,
    default: { charset: 'a-z,A-Z,0-9', len: 32 },
    generate: { charset: 'a-z,A-Z,0-9', len: 32 },
  }),
  idRecoveryCode: Value.text({
    name: i18n('ID Recovery Code'),
    description: i18n(
      'Leave empty to create a new vault. To create another Setup URI for an existing vault, enter the ID recovery code shown when that vault was created.',
    ),
    required: false,
    masked: true,
    default: null,
    patterns: [
      {
        regex: 'sls-id-v1:[0-9a-f]{64}',
        description: i18n(
          'Must be an ID recovery code, which begins with sls-id-v1:',
        ),
      },
    ],
  }),
})

export const createSetupUri = sdk.Action.withInput(
  'create-setup-uri',

  {
    name: i18n('Create Setup URI'),
    description: i18n(
      'Create a vault on this server and the Setup URI that connects Obsidian to it, or another Setup URI for a vault that already exists.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  },

  inputSpec,

  async () => ({}),

  async ({ effects, input }) => {
    const password = await storeJson.read((s) => s.adminPassword).once()
    if (!password) {
      throw new Error(i18n('Run Set Admin Password first.'))
    }
    const idRecoveryCode = input.idRecoveryCode?.trim() || null

    const existing = await fetch(
      `${couchdbUrl}/${encodeURIComponent(input.database)}`,
      { headers: adminHeaders(password) },
    )
    if (existing.ok && !idRecoveryCode) {
      const { doc_count } = (await existing.json()) as { doc_count: number }
      // A freshly provisioned database holds only LiveSync's version document.
      if (doc_count > 1) {
        throw new Error(
          i18n(
            'The database ${database} already holds a vault. Enter its ID recovery code to create another Setup URI for it, or choose a different database name.',
            { database: input.database },
          ),
        )
      }
    }

    await provisionDatabase(effects, password, input.database)

    const uriPassphrase = utils.getDefaultString({
      charset: 'a-z,A-Z,0-9',
      len: 32,
    })
    const generated = await generateSetupUri(effects, {
      host: input.address,
      password,
      database: input.database,
      passphrase: input.passphrase,
      uriPassphrase,
      mode: 'ephemeral',
      idRecoveryCode,
    })

    return {
      version: '1',
      title: i18n('Setup URI'),
      message: [
        i18n(
          'In Obsidian, install and enable the Self-hosted LiveSync plugin, choose to set up with a Setup URI, then enter the Setup URI and the Setup URI passphrase below.',
        ),
        generated.expires
          ? i18n(
              'This Setup URI can be opened until ${expires} (UTC). After that, run this action again with the same database name, encryption passphrase and ID recovery code.',
              { expires: generated.expires },
            )
          : null,
        i18n(
          'Save the vault encryption passphrase and the ID recovery code now. They are not stored on this server and cannot be shown again.',
        ),
      ]
        .filter((line) => line !== null)
        .join('\n\n'),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Setup URI'),
            description: null,
            value: generated.setupUri,
            masked: false,
            copyable: true,
            qr: true,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Setup URI Passphrase'),
            description: i18n('Unlocks the Setup URI when Obsidian opens it.'),
            value: uriPassphrase,
            masked: true,
            copyable: true,
            qr: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Vault Encryption Passphrase'),
            description: i18n(
              'Encrypts the vault end to end. Without it the vault cannot be read.',
            ),
            value: input.passphrase,
            masked: true,
            copyable: true,
            qr: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('ID Recovery Code'),
            description: i18n(
              'Needed to create another Setup URI for this vault, or to mirror it on this server.',
            ),
            value: generated.idRecoveryCode,
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
