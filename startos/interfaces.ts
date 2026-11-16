import { i18n } from './i18n'
import { sdk } from './sdk'
import { couchdbPort } from './utils'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multi = sdk.MultiHost.of(effects, 'couchdb')
  const origin = await multi.bindPort(couchdbPort, { protocol: 'http' })

  const api = sdk.createInterface(effects, {
    name: i18n('Sync Server'),
    id: 'api',
    description: i18n(
      'The CouchDB address the Self-hosted LiveSync plugin syncs through',
    ),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const ui = sdk.createInterface(effects, {
    name: i18n('Fauxton'),
    id: 'ui',
    description: i18n(
      'The CouchDB web admin, for inspecting databases and documents',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '/_utils/',
    query: {},
  })

  return [await origin.export([api, ui])]
})
