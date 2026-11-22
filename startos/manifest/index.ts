import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'obsidian-livesync',
  title: 'Obsidian LiveSync',
  license: 'MIT',
  packageRepo: 'https://github.com/ok/obsidian-livesync-startos',
  upstreamRepo: 'https://github.com/vrtmrz/obsidian-livesync',
  marketingUrl: 'https://github.com/vrtmrz/obsidian-livesync',
  donationUrl: 'https://github.com/sponsors/vrtmrz',
  description: { short, long },
  volumes: ['main', 'config', 'mirror'],
  images: {
    couchdb: {
      source: { dockerTag: 'couchdb:3.5.3' },
      arch: ['x86_64', 'aarch64'],
    },
    cli: {
      source: { dockerTag: 'ghcr.io/vrtmrz/livesync-cli:1.0.52-cli' },
      arch: ['x86_64', 'aarch64'],
    },
    setup: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64'],
    },
  },
})
