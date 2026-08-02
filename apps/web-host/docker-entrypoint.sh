#!/bin/sh
set -eu

# web-host re-links its @workspace-starter/api workspace dependency as a
# plain dependency of the deploy root (see Dockerfile), so the api's own
# schema and node_modules/.bin land there rather than at $PWD.
cd -P /app/node_modules/@workspace-starter/api
PATH="$PWD/node_modules/.bin:$PATH"
export PATH
prisma migrate deploy

exec node /app/dist/server.js
