import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { applyMirrorSettings, databaseNamePattern, wipeMirror } from '../utils'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  enabled: Value.toggle({
    name: i18n('Mirror a Vault'),
    description: i18n(
      'Keep a copy of one vault on this server as ordinary files. Turning this off deletes that copy; the vault itself and your devices are not affected.',
    ),
    default: false,
  }),
  database: Value.text({
    name: i18n('Database Name'),
    description: i18n('The database of the vault to mirror.'),
    required: false,
    default: null,
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
      'The passphrase shown when the vault was created. It is stored on this server so the mirror can decrypt the vault.',
    ),
    required: false,
    masked: true,
    default: null,
  }),
  idRecoveryCode: Value.text({
    name: i18n('ID Recovery Code'),
    description: i18n('The ID recovery code shown when the vault was created.'),
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

export const setVaultMirror = sdk.Action.withInput(
  'set-vault-mirror',

  {
    name: i18n('Set Vault Mirror'),
    description: i18n(
      'Keep an unencrypted copy of one vault on this server as ordinary files, so it is included in backups in readable form. Off by default.',
    ),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'enabled',
  },

  inputSpec,

  async () => {
    const mirror = await storeJson.read((s) => s.mirror).once()
    return mirror ? { enabled: true, ...mirror } : { enabled: false }
  },

  async ({ effects, input }) => {
    const current = await storeJson.read((s) => s.mirror).once()

    if (!input.enabled) {
      await wipeMirror(effects)
      await storeJson.merge(effects, { mirror: null })
      return
    }

    const password = await storeJson.read((s) => s.adminPassword).once()
    if (!password) {
      throw new Error(i18n('Run Set Admin Password first.'))
    }
    const database = input.database?.trim()
    const passphrase = input.passphrase
    const idRecoveryCode = input.idRecoveryCode?.trim()
    if (!database || !passphrase || !idRecoveryCode) {
      throw new Error(
        i18n(
          'Mirroring a vault needs its database name, its encryption passphrase and its ID recovery code.',
        ),
      )
    }

    // Files and local database of one vault must never be synced into another.
    if (
      current?.database !== database ||
      current?.passphrase !== passphrase ||
      current?.idRecoveryCode !== idRecoveryCode
    ) {
      await wipeMirror(effects)
    }
    const mirror = { database, passphrase, idRecoveryCode }
    await applyMirrorSettings(effects, password, mirror)
    await storeJson.merge(effects, { mirror })
  },
)
