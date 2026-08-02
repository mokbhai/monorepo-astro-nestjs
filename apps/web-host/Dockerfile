FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# The Corepack bundled with node:22-slim predates the pinned pnpm and can fail
# to verify its registry signature. Install the same Corepack that CI pins so
# container builds resolve the packageManager version deterministically.
RUN npm install --global corepack@0.34.7 && corepack enable

# Resolve dependencies from the lockfile alone so this layer is cached
# independent of source changes and needs no per-app COPY lines. Adding a
# frontend or backend requires no edit to this Dockerfile. `@jainparichay/*`
# is fetched from GitHub Packages, so `pnpm fetch` needs auth; the committed
# .npmrc supplies only the registry mapping (see Task 8). The credential is
# mounted as a BuildKit secret and written to a user-level npmrc that pnpm
# trusts, then removed in the same layer so it never persists in an image
# layer. pnpm-workspace.yaml must also be present at fetch time: it carries
# `minimumReleaseAgeExclude: ['@jainparichay/*']`, and without it `pnpm
# fetch` applies the default 7-day supply-chain quarantine to our own
# just-published packages and rejects the lockfile. Fail fast (rather than
# ~45s later with an unattributed 401) if the secret is empty, which happens
# when NODE_AUTH_TOKEN isn't set when invoking `docker build`/`docker
# compose build`.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=node_auth_token \
    tok="$(cat /run/secrets/node_auth_token)"; \
    [ -n "$tok" ] || { echo "error: NODE_AUTH_TOKEN must be set to fetch @jainparichay/* from GitHub Packages" >&2; exit 1; }; \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$tok" > /root/.npmrc \
 && pnpm fetch \
 && rm -f /root/.npmrc

COPY . .
RUN pnpm install --frozen-lockfile --offline

ARG PUBLIC_API_URL=
ARG PRIMARY_FRONTEND=web
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
ENV PRIMARY_FRONTEND=${PRIMARY_FRONTEND}

# Build the host server, then build and stage every Astro frontend under
# apps/* into apps/web-host/sites (discovered automatically).
RUN pnpm turbo build --filter=@workspace-starter/web-host...
RUN node scripts/build-frontends.mjs

# `pnpm deploy` re-links @workspace-starter/api (a `workspace:*` dependency
# of web-host — see #20, the combined Astro/NestJS host) as a plain
# dependency of the deployed target rather than a workspace project, which
# subjects its `postinstall` to pnpm's build-script approval gate and fails
# with ERR_PNPM_IGNORED_BUILDS since it isn't in pnpm-workspace.yaml's
# `allowBuilds`. That postinstall only runs `prisma generate`, which the
# next RUN redoes anyway (`pnpm deploy` discards it regardless), so
# `--ignore-scripts` is safe here. Registry auth is needed again too: this
# re-resolves `@jainparichay/*` into the fresh deploy-target store.
RUN --mount=type=secret,id=node_auth_token \
    tok="$(cat /run/secrets/node_auth_token)"; \
    [ -n "$tok" ] || { echo "error: NODE_AUTH_TOKEN must be set to fetch @jainparichay/* from GitHub Packages" >&2; exit 1; }; \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$tok" > /root/.npmrc \
 && pnpm deploy --legacy --filter @workspace-starter/web-host --prod --ignore-scripts /app \
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

ARG PRIMARY_FRONTEND=web
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=4321
ENV PRIMARY_FRONTEND=${PRIMARY_FRONTEND}

COPY --from=build --chown=node:node /app /app
COPY --from=build --chown=node:node /repo/apps/web-host/sites /app/sites
COPY --chown=node:node --chmod=755 apps/web-host/docker-entrypoint.sh /usr/local/bin/web-host-entrypoint

USER node

EXPOSE 4321

CMD ["/usr/local/bin/web-host-entrypoint"]
