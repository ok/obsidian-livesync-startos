import { sdk } from '../sdk'
import { compactDatabases } from './compactDatabases'
import { createSetupUri } from './createSetupUri'
import { setAdminPassword } from './setAdminPassword'
import { setVaultMirror } from './setVaultMirror'

export const actions = sdk.Actions.of()
  .addAction(setAdminPassword)
  .addAction(createSetupUri)
  .addAction(setVaultMirror)
  .addAction(compactDatabases)
