# Customizing The Template

## Rename The Scope

This starter uses the scope `@workspace-starter/*` for its local apps (`web`, `secondary-web`, `web-host`, `api`). Replace it with your own organization or project scope in:

- root and workspace `package.json` files
- import statements
- TypeScript path aliases
- documentation examples

This rename does not touch `@jainparichay/*` — those are external, independently versioned packages published from [github.com/JainParichay/packages](https://github.com/JainParichay/packages), not part of this repo's scope.

## Add A New App

1. Create a folder in `apps/`.
2. Add a `package.json` with workspace scripts.
3. Add its dependencies using `catalog:` and `workspace:*` for internal packages, and the published semver range (for example `^0.1.0`) for `@jainparichay/*` packages.
4. Make sure its scripts align with the root Turbo tasks.
5. If the app serves Astro build output through `apps/web-host` (see [deployment.md](./deployment.md)), mirror every `@jainparichay/*` runtime dependency it needs into `apps/web-host`'s own `dependencies` — `tests/repository-guardrails.test.mjs` enforces this, since web-host serves the built output out of its own deployed `node_modules`.

## Add A Shared Package

Shared code that should be reused across multiple apps or products belongs in [the packages repo](https://github.com/JainParichay/packages) as a new `@jainparichay/*` package, not in this repo's `packages/`. Make the change there, publish a new version, and bump the dependency in the consuming app manifests here.

If instead you want a project-local package — for example, to wrap or extend a `@jainparichay/*` package with behavior specific to this project — add it under your own scope:

1. Create a folder in `packages/`.
2. Add `package.json`, source files, and `tsconfig.json`.
3. Reference `@jainparichay/config-typescript` if it is TypeScript-based.
4. Add build/typecheck scripts that fit the monorepo task graph.

## Environment Variables

Use [.env.example](../../.env.example) as the template source for local environment setup.

## Replace The Showcase UI

The starter homepage is intentionally a showcase page. Replace its sections with your own product UI once the monorepo structure and shared packages are in place.

## Start With Your Own Web App

If you want to keep the API, shared packages, Turbo wiring, CI, and Git hooks but remove the bundled web examples, run a dry run first:

```bash
pnpm template:remove-web-apps:dry-run
```

Then remove the bundled web workspaces:

```bash
pnpm template:remove-web-apps -- --yes
```

This removes:

- `apps/web`
- `apps/secondary-web`
- `apps/web-host`

It also rewrites the root `start` script to launch only `@workspace-starter/api`, removes the `build:frontends` script and `scripts/build-frontends.mjs` (the frontend staging helper), rewrites the stock `docker-compose.yml` to keep the API and PostgreSQL (including their dependency wiring and database volume), removes the bundled web/api start-scripts test (`tests/root-start-scripts.test.mjs`), and drops that file from the root `test` script. The command refuses to run if a root script or Docker Compose file has custom references to one of the removed web workspaces, because those references need a human migration.

After removal, create your own app under `apps/` and give it a workspace package name under the current scope, such as `@workspace-starter/web`. Make sure its scripts line up with the root Turbo tasks: `build`, `dev`, `typecheck`, `lint`, and `test` where applicable. Use `workspace:*` for internal packages and `catalog:` versions for shared dependencies already listed in `pnpm-workspace.yaml`.
