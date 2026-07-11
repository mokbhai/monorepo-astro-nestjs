FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

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
