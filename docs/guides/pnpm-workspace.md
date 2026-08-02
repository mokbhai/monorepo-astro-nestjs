# PNPM Workspace Guide

## What PNPM Workspaces Are Doing Here

PNPM workspaces let the repository manage multiple apps and packages from one lockfile while keeping internal dependencies linked locally through `workspace:*`.

## Workspace Layout

- `apps/*` contains runnable applications (`web`, `secondary-web`, `web-host`, `api`). These are the only local workspace members by default.
- Shared libraries — `@jainparichay/i18n`, `@jainparichay/storage`, `@jainparichay/db`, `@jainparichay/config-typescript`, `@jainparichay/ai`, and optionally `@jainparichay/ui` — are **not** local `packages/*` workspaces. They are published from a separate repo, [github.com/JainParichay/packages](https://github.com/JainParichay/packages), and consumed here as ordinary registry dependencies. Changes to their behavior belong in that repo, not here. These packages carry mechanism only — no database schemas, no domain types, no visual design — so an app's own data model and brand styling always live in the app, not in the shared package.
- An app may still add its own `packages/<name>` under its own scope (for example, to wrap or extend a `@jainparichay/*` package with project-specific behavior); in that case it becomes a normal local workspace member again.

The workspace is defined in [pnpm-workspace.yaml](../../pnpm-workspace.yaml).

## Registry Authentication

`@jainparichay/*` packages are fetched from GitHub Packages (`npm.pkg.github.com`), which requires a token even though the packages are public. The committed [`.npmrc`](../../.npmrc) carries only the registry mapping — **never put the token in it**; pnpm ignores tokens in a committed `.npmrc` by design, and the install fails with `ERR_PNPM_FETCH_401` if you try. Supply the token instead through:

- `pnpm config set //npm.pkg.github.com/:_authToken <token>` locally,
- `actions/setup-node` with `registry-url` set in CI, or
- a BuildKit secret written to `/root/.npmrc` inside the Dockerfile (see [deployment.md](./deployment.md)).

Migrating an app that still carries its own local copies of these packages?
See [migrating-apps-to-shared-packages.md](./migrating-apps-to-shared-packages.md).

## Useful Commands

```bash
pnpm install
pnpm --filter @workspace-starter/web dev
pnpm --filter @workspace-starter/secondary-web dev
pnpm --filter @workspace-starter/web-host start
pnpm --filter @workspace-starter/api dev
```

`@jainparichay/*` packages are not local workspaces, so `pnpm --filter` cannot target them; their build/lint/test commands live in the [packages repo](https://github.com/JainParichay/packages).

## Workspace Dependencies

Use `workspace:*` for internal (in-repo) packages, and the published semver range for external shared packages:

```json
{
  "dependencies": {
    "@workspace-starter/api": "workspace:*",
    "@jainparichay/i18n": "^0.1.0",
    "@jainparichay/db": "^0.2.1"
  }
}
```

`workspace:*` keeps local package resolution explicit and makes refactors easier across the monorepo. Most `@jainparichay/*` packages are ESM-only; `@jainparichay/ui` and `@jainparichay/db` additionally ship a CommonJS `require()` entry, so a CommonJS consumer (this repo's `apps/api`, for example) can depend on either directly. A CommonJS consumer of any other `@jainparichay/*` package needs `await import()` instead. `@jainparichay/db` exports mechanism only (`createDatabaseClient`, `createPgAdapter`) — it ships no schema and no generated Prisma Client. A consuming app owns its own `prisma/schema.prisma` and runs `prisma generate` against it (this repo does so via `apps/api`'s `postinstall`; see `pnpm db:generate`).

## Catalogs

This starter uses PNPM catalogs in [pnpm-workspace.yaml](../../pnpm-workspace.yaml) for common dependency versions. Use `catalog:` when multiple workspaces should share the same version of a dependency.

## Adding A New Package

1. Create a new folder under `packages/`.
2. Add a `package.json` with a scoped name.
3. Add scripts for `build`, `typecheck`, or other tasks as needed.
4. Reference it from apps or other packages using `workspace:*`.

This is for an app-local package (for example, one that wraps a `@jainparichay/*` dependency). To change a `@jainparichay/*` package itself, make the change in [the packages repo](https://github.com/JainParichay/packages) and publish a new version instead.
