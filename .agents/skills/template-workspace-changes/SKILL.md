---
name: template-workspace-changes
description: Use when adding, renaming, removing, moving, wiring, optimizing, or debugging apps/* or packages/* workspaces in the JainParichay template-jp PNPM/Turbo monorepo, including removing bundled template web apps, shared dependency management, package boundaries, workspace graph changes, Turbo task/cache behavior, package names, workspace:* links, pnpm catalogs, tsconfig presets, exports, README/docs commands, imports, or tests.
---

# Template Workspace Changes

Use this skill to keep workspace graph changes in `template-jp` correct across manifests, config presets, imports, docs, and verification.

## Start With The Current Graph

Before editing, inspect the repo's actual conventions:

- `package.json` for root scripts, package manager, and root dev dependencies.
- `pnpm-workspace.yaml` for `apps/*`, `packages/*`, `catalog`, `catalogs`, and `allowBuilds`.
- `turbo.json` for task names, dependencies, caching, inputs, and outputs.
- `apps/*/package.json` (and any app-added `packages/*/package.json` under its own scope) for names, scripts, exports, and local links.
- each workspace `tsconfig.json` for the correct preset from the published `@jainparichay/config-typescript`.
- `README.md`, `docs/guides/*`, source imports, and tests for hardcoded workspace names or filter commands.

Shared packages (`@jainparichay/i18n`, `storage`, `db`, `config-typescript`, `ai`, and optionally `ui`) are **not** local `packages/*` workspaces here — they are published from a separate repo, [github.com/JainParichay/packages](https://github.com/JainParichay/packages), and consumed as ordinary registry dependencies. They carry mechanism only: no database schemas, no domain types, no visual design. `@jainparichay/types` was retired (its contents were one app's domain model, not mechanism) — nothing in this repo depends on it, and no replacement shared-types package should be added; domain contracts live in the app that owns them. `apps/*` is normally the only source of local workspace manifests; `packages/*` only exists if an app added its own package under its own scope (for example, to wrap or extend a `@jainparichay/*` package).

Do not assume a root `tsconfig.json` exists. If one is absent, do not create it unless the change genuinely introduces root TypeScript compilation.
Do not copy generic monorepo examples from outside references without adapting them to the current PNPM 11, Turbo 2, package names, and task names in this repo.

## Monorepo Design Rules

- Keep the workspace dependency graph acyclic. Shared packages may be depended on by apps and higher-level packages, but a shared package must not import from an app or from a consumer that depends on it.
- Avoid phantom dependencies. If a workspace imports a runtime package, type package, or internal workspace, declare it in that workspace's `dependencies` or `devDependencies`; do not rely on hoisting or root dependencies. This applies to `@jainparichay/*` packages too — declare them directly in every workspace that imports them (see the web-host mirror rule below).
- Put code in the narrowest durable owner. Use `@jainparichay/i18n` for locale behavior, `@jainparichay/db` for the database-connection mechanism (not the schema — that stays app-local, e.g. `apps/api/prisma/`), `@jainparichay/ui` for cross-app-reusable React UI primitives with no baked-in color palette, and app-local modules for behavior, data models, or visual design that only one app uses. Changing a `@jainparichay/*` package means making the change in [the packages repo](https://github.com/JainParichay/packages) and bumping the version here, not editing `template-jp` directly.
- Do not over-share early. Extract to a new `@jainparichay/*` package (in the packages repo) when multiple workspaces or products need the behavior now, or when a public contract/package boundary is part of the task. Otherwise keep the code app-local. An app-local `packages/<name>` under your own scope is appropriate only for wrapping or extending a `@jainparichay/*` package with project-specific behavior.
- `apps/web-host` serves the Astro apps' built output out of its own deployed `node_modules`, so every `@jainparichay/*` runtime dependency of an Astro app must also appear in `apps/web-host`'s `dependencies` at the same version. `tests/repository-guardrails.test.mjs` enforces this; this exact drift has shipped as a container-runtime failure twice (commit `81417a8`, and the web-host 500 fixed alongside the shared-packages-registry migration) with `pnpm build`/`typecheck`/`test`/CI all green.
- Keep shared dependency versions consistent through `pnpm-workspace.yaml` catalogs. Before adding a version to a package manifest, check whether a root catalog entry already exists or should be added because more than one workspace uses it.
- Treat package exports as contracts. If a consumer imports a subpath, make sure the provider's `exports`, build output, and TypeScript declarations all support that subpath.
- When optimizing Turbo behavior, prefer correct inputs, outputs, and task dependencies over broad cache disabling. Include env vars that affect outputs, exclude only known non-output caches, and keep persistent tasks uncached.
- Do not add root scripts or Turbo tasks that are only thin aliases for one workspace unless they represent a repo-level workflow. Package-specific behavior should usually live in the package script and be called with `pnpm --filter`.

## Change Rules

- Keep local workspace package names under the current starter scope unless the task is a scope rename. Current examples are `@workspace-starter/web`, `@workspace-starter/secondary-web`, `@workspace-starter/web-host`, and `@workspace-starter/api`. `@jainparichay/*` packages (`i18n`, `storage`, `db`, `config-typescript`, `ai`, and optionally `ui`) are external and keep their own scope regardless of this repo's scope.
- Use `workspace:*` for every internal package dependency, and the published semver range (for example `^0.2.1`, `db`'s current range) for `@jainparichay/*` dependencies. After renames, update package manifests, source imports, TypeScript `paths`, root scripts, docs, and tests together.
- Prefer `catalog:` or `catalog:<name>` for shared dependency versions already centralized in `pnpm-workspace.yaml`. Add catalog entries for dependencies reused across workspaces; use literal versions only when a dependency is intentionally local to one workspace.
- Choose the closest TypeScript preset from the published `@jainparichay/config-typescript`: `astro.json` for Astro apps, `nestjs.json` for NestJS apps, `react-library.json` for React libraries, `base.json` for plain TS packages, and `node.json` for Node packages.
- Adding or renaming a config preset means changing `@jainparichay/config-typescript` in the packages repo and bumping the dependency here — there is no local `packages/config-typescript` to edit.
- Keep package `exports` aligned with build behavior. Built libraries such as UI should export `dist` artifacts; type-only/source-shared packages may export source when that is the established local pattern.
- Add or change `turbo.json` tasks only when matching workspace scripts exist or will exist. If a root script calls `turbo <task>`, confirm affected workspaces define that script or are intentionally skipped.
- Update README and guides when workspace names, filters, app/package lists, ports, or setup/start commands change. Fix stale absolute doc links when touching nearby docs.
- Update tests when invariants change. Existing root tests assert production start workspace filters; add focused tests for new cross-workspace invariants instead of relying only on manual review.
- When a user wants to remove the bundled web examples before creating their own app, prefer the supported command path: `pnpm template:remove-web-apps:dry-run`, then `pnpm template:remove-web-apps -- --yes`. It removes `apps/web`, `apps/secondary-web`, and `apps/web-host`, rewrites the root production `start` script and stock Docker Compose files to API-only, and refuses custom stale script or compose references. If changing that behavior, update `scripts/template/remove-web-apps.mjs`, `tests/remove-template-web-apps.test.mjs`, docs, and root command guardrails together.

## Minimal Edit Sequence

1. Map affected workspaces and all current references with `rg`.
2. Edit package manifests first, then TypeScript config, exports, imports, Turbo config, docs, and tests.
3. Check each changed workspace manifest for direct dependencies used by its imports and scripts.
4. Re-run `rg` for old package names, old paths, stale filter commands, and removed scripts.
5. Keep changes narrow; do not refactor unrelated workspace structure while wiring one app or package.

## Verification

Run the smallest commands that prove the changed invariant:

- dependency or lockfile changes: `pnpm install --lockfile-only`
- one workspace: `pnpm --filter <workspace-name> typecheck`, plus `build` or `lint` when its scripts changed
- package exports or upstream dependency graph changes: `pnpm build`
- Turbo task or root script changes: the relevant root command, such as `pnpm typecheck`, `pnpm build`, or `pnpm test`
- shared dependency, package-boundary, or catalog changes: `pnpm install --lockfile-only`, then the affected workspace checks and any consuming workspace checks
- test invariant changes: run the changed test file directly when possible, then the root `pnpm test` if root workspace behavior changed

If verification cannot run, report the exact command and reason.

## Common Failure Modes

- A package was renamed in `package.json` but not in imports, `paths`, docs, root scripts, or tests.
- A shared dependency was added with a literal version instead of `catalog:`.
- A workspace import works locally only because another workspace or the root declares the dependency.
- A shared package imports from an app or from a downstream consumer, creating a circular or inverted graph.
- A workspace uses the wrong config-typescript preset.
- A new package lacks an `exports` entry that consumers can resolve.
- `turbo.json` contains a task no workspace implements, omits outputs needed for cache replay, or misses env/input files that change build output.
- README or guide examples still reference removed package filters.
