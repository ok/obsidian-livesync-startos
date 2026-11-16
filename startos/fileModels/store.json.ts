import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const mirror = z.looseObject({
  database: z.string(),
  passphrase: z.string(),
  idRecoveryCode: z.string(),
})

export type Mirror = z.infer<typeof mirror>

export const storeJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'store.json' },
  z.looseObject({
    adminPassword: z.string().optional().catch(undefined),
    mirror: mirror.nullable().optional().catch(undefined),
  }),
)
