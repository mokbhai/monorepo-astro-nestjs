#!/bin/sh
set -eu

cd -P /app/node_modules/@workspace-starter/db
PATH="$PWD/node_modules/.bin:$PATH"
export PATH
prisma migrate deploy

exec node /app/dist/server.js
