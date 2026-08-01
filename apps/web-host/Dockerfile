FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# The Corepack bundled with node:22-slim predates the pinned pnpm and can fail
# to verify its registry signature. Install the same Corepack that CI pins so
# container builds resolve the packageManager version deterministically.
RUN npm install --global corepack@0.34.7 && corepack enable

# Resolve dependencies from the lockfile alone so this layer is cached
# independent of source changes and needs no per-app COPY lines. Adding a
# frontend or backend requires no edit to this Dockerfile.
COPY pnpm-lock.yaml ./
RUN pnpm fetch

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
RUN pnpm deploy --legacy --filter @workspace-starter/web-host --prod /app

# `pnpm deploy` rebuilds /app/node_modules from the content-addressable store,
# which discards the Prisma Client generated during the build. The generator
# has no custom output, so regenerate it inside the deployed tree.
RUN cd -P /app/node_modules/@workspace-starter/db \
 && PATH="$PWD/node_modules/.bin:$PATH" prisma generate

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
