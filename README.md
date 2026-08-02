# PNPM Turbo Workspace Starter

Stop spending the first stretch of a new project wiring the same architecture from scratch.

This starter gives you a full-stack TypeScript monorepo with the core pieces already connected: an Astro + React web app, a NestJS + tRPC API, shared UI, shared types, shared i18n helpers, reusable TypeScript configs, Turborepo task orchestration, Git hooks, and CI checks.

![A developer surrounded by messy setup work that resolves into a clean monorepo architecture board.](./docs/assets/template-architecture-pain.png)

## Why This Exists

Setting up a serious app from a blank folder usually means making a pile of early decisions before the product work even starts:

- How should apps and packages be split?
- How should the frontend talk to the backend?
- Where do shared contracts live?
- How do local packages stay linked without version drift?
- Which commands should run in CI, Git hooks, and local development?
- How do you keep the setup easy to rename for the next project?

This template answers those questions with a small, working baseline. It is opinionated enough to be useful, but not so heavy that you have to fight it.

## What's Inside

```text
apps/
  web            Astro + React showcase app
  secondary-web  Second Astro app for deployment strategy testing
  web-host       Node static host that serves both Astro builds
  api            NestJS + tRPC sample API
```

Shared code — UI components, types/contracts, i18n helpers, database access, and reusable `tsconfig` presets — is no longer a local `packages/*` workspace. It is published from a separate repo, [github.com/JainParichay/packages](https://github.com/JainParichay/packages), and consumed here as versioned `@jainparichay/*` dependencies (`@jainparichay/ui`, `@jainparichay/types`, `@jainparichay/i18n`, `@jainparichay/storage`, `@jainparichay/db`, `@jainparichay/config-typescript`, `@jainparichay/ai`). Changes to that shared code belong in the packages repo, not here. See [docs/guides/pnpm-workspace.md](docs/guides/pnpm-workspace.md).

The sample app is intentionally real enough to prove the architecture:

- The web app imports the published shared UI and i18n packages.
- React islands call the typed tRPC API.
- Frontend and backend code share contracts through the published `@jainparichay/types` package.
- Internal (in-repo) dependencies use `workspace:*`; external shared packages use their published semver range.
- Turborepo runs build, lint, typecheck, and test tasks across the graph.

## Stack

- PNPM workspaces
- Turborepo
- Astro + React
- NestJS + Fastify
- tRPC
- React Query
- TypeScript
- Tailwind CSS
- Node test runner and Vitest
- ESLint and Prettier
- Git hooks and GitHub Actions

## Getting Started

Use Node `>=22.13.0` and the pinned package manager, `pnpm@11.17.0`.

### 1. Authenticate to GitHub Packages

Shared `@jainparichay/*` packages are fetched from GitHub Packages
(`npm.pkg.github.com`). The repo's committed `.npmrc` carries only the
registry mapping (`@jainparichay:registry=...`) — it never carries a token,
because pnpm ignores tokens in a committed `.npmrc` by design (secret-leak
risk) and the install fails with `ERR_PNPM_FETCH_401` if you put one there.
Supply the token locally instead:

```bash
pnpm config set //npm.pkg.github.com/:_authToken <a GitHub token with read:packages>
```

(In CI this comes from `actions/setup-node` with `registry-url` set; in Docker
builds it comes from a BuildKit secret — see
[docs/guides/deployment.md](docs/guides/deployment.md).)

### 2. Bring up Postgres and configure the environment

The API hard-fails at startup if `DATABASE_URL` is not set, so set up the
database and environment file before running `pnpm dev`:

```bash
cp .env.example .env
docker compose up -d postgres
```

### 3. Install, migrate, and run

```bash
pnpm install
pnpm db:deploy
pnpm dev
```

`pnpm install` must come first — `db:deploy` runs against the Prisma Client
that `pnpm install` generates. `db:deploy` then applies the migrations
shipped inside `@jainparichay/db`, which is what creates the tables on a
fresh database; skipping it leaves the API able to boot but unable to answer
any real query. (Use `db:deploy`, not `db:migrate`, for this — `migrate dev`
is for authoring new migrations during development and can prompt or reset
the database, which is the wrong behavior for a first-run setup step.)

`pnpm dev` runs the API and the Astro apps with hot reload — it does not run
the combined production-style host (`apps/web-host`), which has no
meaningful "dev mode" of its own: it only ever serves prebuilt Astro output.
Use `pnpm start` (below) to run that combined host locally.

Default local ports:

- Web: `http://127.0.0.1:4321`
- API: `http://localhost:3001`

For a production-style local run:

```bash
pnpm start
```

`pnpm start` builds the workspace, stages every Astro frontend into the web host, then launches one Fastify/Nest process and one public listener. NestJS handles `/trpc/*` first, the primary Astro app runs through `@astrojs/node` middleware at `/`, and secondary prerendered apps remain available at paths such as `/secondary-web`. Use `pnpm --filter @workspace-starter/api start` when running the API as a separate service.

See [docs/guides/deployment.md](docs/guides/deployment.md) for how frontends and backends are built, published, and deployed.

## One-Command Bootstrap

Create a fresh project from the starter:

```bash
curl -fsSL https://raw.githubusercontent.com/mokbhai/monorepo-astro-nestjs/main/scripts/bootstrap.sh | bash -s -- my-app
```

The bootstrap flow:

- clones this starter into a fresh directory
- launches an interactive TUI installer
- renames the root package
- runs `pnpm install`
- removes the starter Git history
- removes the bootstrap installer files before commit
- initializes a fresh Git repository
- creates the first commit automatically

## Common Commands

```bash
pnpm dev
pnpm start
pnpm build:frontends
pnpm setup:starter
pnpm template:remove-web-apps:dry-run
pnpm template:remove-web-apps -- --yes
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm verify:fast
pnpm verify
pnpm hooks:install
pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:studio
```

The `db:*` scripts run `scripts/prisma.mjs`, which resolves the Prisma CLI and
schema from the installed `@jainparichay/db` package (its `prisma.config.ts`
points at its own bundled `schema.prisma` and `migrations/`) rather than a
local `prisma/` folder in this repo. `db:generate` runs automatically on
`pnpm install` via `apps/api`'s `postinstall`; `db:migrate`, `db:deploy`, and
`db:studio` need `DATABASE_URL` set — `scripts/prisma.mjs` loads it from the
root `.env` you created in Getting Started, so no extra setup is needed here.

Useful workspace-focused commands:

```bash
pnpm --filter @workspace-starter/web dev
pnpm --filter @workspace-starter/secondary-web dev
pnpm --filter @workspace-starter/web-host start
pnpm --filter @workspace-starter/api dev
```

`@jainparichay/*` packages are no longer local workspaces, so they cannot be
targeted with `pnpm --filter`; building, testing, and linting them happens in
the [packages repo](https://github.com/JainParichay/packages).

Useful Docker commands:

```bash
docker compose up --build
```

The compose file runs the **combined web host** (NestJS/tRPC, the primary Astro SSR runtime, and static secondary Astro apps) plus PostgreSQL. It exposes one application port. The API retains its standalone Dockerfile and startup command for a future split deployment. See [docs/guides/deployment.md](docs/guides/deployment.md).

## Quality Gates

Run this once per checkout to use the repository hooks:

```bash
pnpm hooks:install
```

- `pre-commit` runs `pnpm verify:fast`, which checks lint, formatting, types, and whitespace errors.
- `pre-push` runs `pnpm verify`, which adds the full build and test suite.
- GitHub Actions runs `pnpm verify` on pull requests and pushes to `main`.

## Customizing The Template

This starter uses the scope `@workspace-starter/*` for the local apps (`web`, `api`, `web-host`, `secondary-web`). Replace it with your own project or organization scope in package manifests, imports, TypeScript path aliases, and docs examples.

Shared packages (`@jainparichay/*`) are external and versioned independently — renaming this repo's scope does not touch them. If you need to wrap or extend a `@jainparichay/*` package with project-specific behavior, add your own `packages/<name>` workspace under your own scope that depends on the published package, rather than forking it into this repo.

The included homepage is a showcase page. Once the repo structure is in place, replace it with your product UI and keep the workspace boundaries.

If you want to start with your own frontend instead of the bundled web examples, use `pnpm template:remove-web-apps:dry-run` and then `pnpm template:remove-web-apps -- --yes`. That removes `apps/web`, `apps/secondary-web`, and `apps/web-host`, then rewrites the root production start script and stock Docker Compose file to keep the API and PostgreSQL while removing the web host.

## Guides

- [PNPM workspace guide](./docs/guides/pnpm-workspace.md)
- [Turborepo guide](./docs/guides/turborepo.md)
- [Template customization guide](./docs/guides/customizing-the-template.md)
- [Shared-packages migration guide](./docs/guides/migrating-apps-to-shared-packages.md)

## Suggested Workflow

1. Install dependencies with `pnpm install`.
2. Run the workspace with `pnpm dev`.
3. Explore the web app, API, and shared packages.
4. Rename the scope and packages for your project.
5. Run `pnpm verify:fast` before committing.
6. Add new apps or packages as the monorepo grows.
