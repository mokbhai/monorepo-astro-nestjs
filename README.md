# PNPM Turbo Workspace Starter

A generic monorepo starter built with PNPM workspaces, TurboRepo, Astro + React, NestJS, shared UI components, shared types, and reusable TypeScript configs.

## Included Workspaces

```text
apps/
  web      Astro + React showcase app
  api      NestJS + tRPC sample API
packages/
  ui       Shared React UI components
  types    Shared types and contracts
  config-typescript  Reusable tsconfig presets
```

## Getting Started

```bash
pnpm install
pnpm dev
pnpm start
```

## One-Command Bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/mokbhai/JP/main/scripts/bootstrap.sh | bash -s -- my-app
```

The bootstrap flow:

- clones this starter into a fresh directory
- launches an interactive TUI installer
- renames the root package
- runs `pnpm install`
- removes the starter git history
- removes the bootstrap installer files before commit
- initializes a fresh git repository
- creates the first commit automatically

The default local ports are:

- Web: `http://127.0.0.1:4321`
- API: `http://localhost:3001`

## Common Commands

```bash
pnpm dev
pnpm start
pnpm setup:starter
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @workspace-starter/web dev
pnpm --filter @workspace-starter/api dev
pnpm --filter @workspace-starter/ui build
```

## Why This Starter

- PNPM workspaces keep dependencies and local package links manageable.
- TurboRepo coordinates tasks across apps and packages.
- Astro + React provides a fast frontend shell with room for islands and shared UI.
- NestJS + tRPC demonstrates a backend that can share contracts with the frontend.

## Guides

- [PNPM workspace guide](./docs/guides/pnpm-workspace.md)
- [TurboRepo guide](./docs/guides/turborepo.md)
- [Template customization guide](./docs/guides/customizing-the-template.md)

## Starter Workflow

1. Install dependencies with `pnpm install`.
2. Run the workspace with `pnpm dev` for local development.
3. Run `pnpm start` to build and launch the production web and API servers together.
4. Explore the sample app and shared packages.
5. Rename the scope and packages for your own project.
6. Add new apps or packages as the monorepo grows.
