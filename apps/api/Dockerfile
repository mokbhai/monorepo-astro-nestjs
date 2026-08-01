FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# The Corepack bundled with node:22-slim predates the pinned pnpm and can fail
# to verify its registry signature. Install the same Corepack that CI pins so
# container builds resolve the packageManager version deterministically.
RUN npm install --global corepack@0.34.7 && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo build --filter=@workspace-starter/api...

RUN pnpm deploy --legacy --filter @workspace-starter/api --prod /app

# `pnpm deploy` rebuilds /app/node_modules from the content-addressable store,
# which discards the Prisma Client generated during the build. The generator
# has no custom output, so regenerate it inside the deployed tree.
RUN cd -P /app/node_modules/@workspace-starter/db \
 && PATH="$PWD/node_modules/.bin:$PATH" prisma generate

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build --chown=node:node /app /app
COPY --chown=node:node --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint

USER node

EXPOSE 3001

CMD ["/usr/local/bin/api-entrypoint"]
