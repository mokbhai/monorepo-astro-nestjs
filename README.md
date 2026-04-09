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
```

The default local ports are:

- Web: `http://127.0.0.1:4321`
- API: `http://localhost:3001`

## Common Commands

```bash
pnpm dev
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
2. Run the workspace with `pnpm dev`.
3. Explore the sample app and shared packages.
4. Rename the scope and packages for your own project.
5. Add new apps or packages as the monorepo grows.
