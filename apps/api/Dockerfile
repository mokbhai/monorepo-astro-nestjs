FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# The Corepack bundled with node:22-slim predates the pinned pnpm and can fail
# to verify its registry signature. Install the same Corepack that CI pins so
# container builds resolve the packageManager version deterministically.
RUN npm install --global corepack@0.34.7 && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json apps/api/package.json

# apps/api's postinstall runs `node ../../scripts/prisma.mjs generate`, so the
# helper must exist on disk before `pnpm install` below (which triggers that
# hook) — the rest of the source tree isn't copied until after the install
# layer, to keep dependency resolution cached independent of source changes.
# scripts/prisma.mjs must stay free of local imports (only node: builtins):
# it is the only file from scripts/ copied into this layer, so anything it
# imports from a sibling module would fail to resolve here with no test
# covering the break.
COPY scripts/prisma.mjs scripts/prisma.mjs

# `@jainparichay/*` is fetched from GitHub Packages, which requires auth. The
# committed .npmrc supplies only the registry mapping (see Task 8); the
# credential itself is mounted as a BuildKit secret and written to a
# user-level npmrc that pnpm trusts, then removed in the same layer so it
# never persists in an image layer. Fail fast (rather than ~45s later with an
# unattributed 401) if the secret is empty, which happens when NODE_AUTH_TOKEN
# isn't set when invoking `docker build`/`docker compose build`.
RUN --mount=type=secret,id=node_auth_token \
    tok="$(cat /run/secrets/node_auth_token)"; \
    [ -n "$tok" ] || { echo "error: NODE_AUTH_TOKEN must be set to fetch @jainparichay/* from GitHub Packages" >&2; exit 1; }; \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$tok" > /root/.npmrc \
 && pnpm install --frozen-lockfile \
 && rm -f /root/.npmrc

COPY . .

# Once the rest of the workspace (apps/web, apps/web-host, ...) lands on disk,
# pnpm's automatic pre-run dependency check (`verify-deps-before-run`, on by
# default) notices those importers now exist and silently re-installs the
# full workspace before `turbo` runs — which needs registry auth again, for
# the same reason as the install above. That implicit re-install is not
# `--frozen-lockfile` on its own, so make one explicit here: it's a no-op
# when the manifests and lockfile already agree, and it fails loudly instead
# of silently re-resolving against a stale lockfile if they ever don't.
RUN --mount=type=secret,id=node_auth_token \
    tok="$(cat /run/secrets/node_auth_token)"; \
    [ -n "$tok" ] || { echo "error: NODE_AUTH_TOKEN must be set to fetch @jainparichay/* from GitHub Packages" >&2; exit 1; }; \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$tok" > /root/.npmrc \
 && pnpm install --frozen-lockfile \
 && pnpm turbo build --filter=@workspace-starter/api... \
 && pnpm deploy --legacy --filter @workspace-starter/api --prod /app \
 && rm -f /root/.npmrc

# `pnpm deploy` rebuilds /app/node_modules from the content-addressable store,
# which discards the Prisma Client generated during the build. The generator
# has no custom output, so regenerate it inside the deployed tree. This is an
# inline command rather than a call to scripts/prisma.mjs: `pnpm deploy`
# never copies scripts/ into /app at all, and even if it were present there,
# `--prod` means the `prisma` devDependency the script shells out to isn't
# installed in the deployed tree. `@jainparichay/db`'s prisma.config.ts
# throws if DATABASE_URL is unset (it's loaded even for `generate`), so
# supply a placeholder — this never connects to a database.
RUN cd -P /app/node_modules/@jainparichay/db \
 && DATABASE_URL="postgresql://placeholder" PATH="$PWD/node_modules/.bin:$PATH" prisma generate

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build --chown=node:node /app /app
COPY --chown=node:node --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint

USER node

EXPOSE 3001

CMD ["/usr/local/bin/api-entrypoint"]
