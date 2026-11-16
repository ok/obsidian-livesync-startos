# Upstream's CouchDB provisioning and Setup URI tools, with their dependencies
# cached at build time so they run without network access.
FROM denoland/deno:debian-2.9.8

ENV DENO_DIR=/opt/deno-cache
WORKDIR /opt/livesync

COPY obsidian-livesync/utils ./utils

RUN deno cache \
        --minimum-dependency-age=0 \
        --config=utils/flyio/deno.jsonc \
        --frozen \
        --lock=utils/flyio/deno.lock \
        utils/couchdb/provision.ts \
        utils/setup/generate_setup_uri.ts
