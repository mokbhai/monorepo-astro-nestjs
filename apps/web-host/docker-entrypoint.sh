#!/bin/sh
set -eu

cd -P /app/node_modules/@jainparichay/db
PATH="$PWD/node_modules/.bin:$PATH"
export PATH
prisma migrate deploy

exec node /app/dist/server.js
