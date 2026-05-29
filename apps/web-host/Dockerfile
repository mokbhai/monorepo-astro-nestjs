FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/secondary-web/package.json apps/secondary-web/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/web-host/package.json apps/web-host/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG PUBLIC_API_URL=http://localhost:3001
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

RUN pnpm turbo build --filter=@workspace-starter/web --filter=@workspace-starter/secondary-web --filter=@workspace-starter/web-host

FROM node:22-slim AS runtime

WORKDIR /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=4321
ENV PRIMARY_WEB_DIST=/app/web
ENV SECONDARY_BASE_PATH=/secondary
ENV SECONDARY_WEB_DIST=/app/secondary-web

COPY --from=build --chown=node:node /repo/apps/web-host/dist /app/dist
COPY --from=build --chown=node:node /repo/apps/web/dist/client /app/web
COPY --from=build --chown=node:node /repo/apps/secondary-web/dist /app/secondary-web

USER node

EXPOSE 4321

CMD ["node", "dist/server.js"]
