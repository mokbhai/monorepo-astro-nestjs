# TurboRepo Guide

## What TurboRepo Is Handling

TurboRepo runs tasks across the workspace, respects dependency order, and caches work when possible.

The task graph is configured in [turbo.json](../../turbo.json).

## Root Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

These commands map to Turbo tasks that run in the relevant apps and packages.

## Important Task Behavior

- `build` depends on upstream package builds.
- `dev` is persistent and uncached.
- `typecheck` runs across workspaces that define it.
- `test` depends on successful builds first.

## Filtering

Turbo works well with PNPM filters:

```bash
pnpm --filter @workspace-starter/web build
pnpm --filter @workspace-starter/secondary-web build
pnpm --filter @workspace-starter/web-host typecheck
pnpm --filter @workspace-starter/api typecheck
```

Use filtering when you want to focus on one workspace during development without losing the shared monorepo setup. `@jainparichay/*` packages are published dependencies, not local workspaces, so they are not filter targets here — see [pnpm-workspace.md](./pnpm-workspace.md).

## When To Add A Turbo Task

Add a task when multiple workspaces should share a workflow, such as:

- build
- typecheck
- lint
- test
- code generation
