#!/bin/sh
set -eu

# apps/api is the deploy root (see Dockerfile), so its own schema and
# node_modules/.bin are already at $PWD (WORKDIR /app) — no cd needed.
PATH="$PWD/node_modules/.bin:$PATH"
export PATH
prisma migrate deploy

exec node /app/dist/main
