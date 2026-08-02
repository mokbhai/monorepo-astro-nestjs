# Migrating an existing app to `@jainparichay/*` shared packages

## Who this is for

You maintain an app that still carries its own local copies of what are now
the `@jainparichay/*` shared packages (`i18n`, `storage`, `db`,
`config-typescript`, `ai`, and optionally `ui`). Those packages used to live
in every app's own `packages/*` workspace; updating one meant hand-editing
every app that copied it. They have since been extracted into a separate
public repo, [github.com/JainParichay/packages](https://github.com/JainParichay/packages),
and published to GitHub Packages (versions vary per package — `db` is
currently at `0.2.1`, the rest at `0.1.0`; check `pnpm view
@jainparichay/<name> version` for the current one). This template
(`template-jp`) has already been migrated to consume them — it is the
worked example this guide is drawn from.

Every `@jainparichay/*` package carries **mechanism only** — no database
schemas, no domain types, no visual design. `@jainparichay/types` (a
shared-contracts package that used to be part of this list) was retired for
exactly that reason: its contents were one app's domain model, not a
reusable mechanism. Do not migrate an app's own domain types to a shared
package as part of this guide; keep them in the app. See the boundary
statement in this repo's [`AGENTS.md`](../../AGENTS.md#state-the-boundary)
and [`README.md`](../../README.md) for the rule this guide exists to
uphold.

Follow the steps in order. Each one calls out the specific mistake that cost
real debugging time during this migration, so skipping ahead is likely to
reproduce it.

## Prerequisites

- A GitHub personal access token with `read:packages` scope. The
  `@jainparichay/*` packages currently have private visibility, so
  `read:packages` scope alone is not enough — the token must also belong to a
  member of the `JainParichay` GitHub org, or GitHub Packages returns a 401
  regardless of scope. (If the packages are later made public, this
  org-membership requirement goes away and `read:packages` scope on its own
  is sufficient.)
- Your app already uses PNPM workspaces. If it doesn't, adapt the `.npmrc`
  and `pnpm-workspace.yaml` steps to your package manager's equivalents.

## Step 1: Add the registry mapping — never the token — to a committed `.npmrc`

Add exactly this line to the app's committed `.npmrc` (see this repo's
[`.npmrc`](../../.npmrc)):

```
@jainparichay:registry=https://npm.pkg.github.com
```

Do **not** add an `_authToken` line to this file, and do not try to make it
read one from an environment variable (`${NODE_AUTH_TOKEN}` interpolation
included). pnpm deliberately refuses to expand environment variables in
registry credentials that come from a project-level `.npmrc` — a committed
file is a secret-leak risk, since anyone with read access to the repo could
point `@jainparichay:registry` at an attacker-controlled registry and have
your credential sent there. If you try it anyway, you'll see:

```
[WARN] Ignored project-level auth setting ...
```

followed by `ERR_PNPM_FETCH_401` on install. Setting `NODE_AUTH_TOKEN` alone
does **not** fix this either — the credential has to actually land in an
npmrc file that pnpm trusts (a user-level one, not the project one). There
are exactly three trusted routes, matching the three places installs happen:

1. **Locally, once per machine:**

   ```bash
   pnpm config set "//npm.pkg.github.com/:_authToken" "<your PAT>"
   ```

   This writes to your user-level `~/.npmrc`, which pnpm does trust.

2. **In GitHub Actions:** use `actions/setup-node` with `registry-url` set,
   and export `NODE_AUTH_TOKEN` for the install step. This repo's
   [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) does this:

   ```yaml
   env:
     NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN }}

   steps:
     - uses: actions/checkout@v7
     - uses: actions/setup-node@v7
       with:
         node-version: 22.13.0
         registry-url: https://npm.pkg.github.com
     # ...then activate whatever package manager your app pins (this repo
     # installs and enables a pinned Corepack version, then `corepack
     # prepare pnpm@<version> --activate` — see the full sequence in
     # .github/workflows/ci.yml) before:
     - run: pnpm install --frozen-lockfile
   ```

   This is trimmed to the registry-auth-relevant steps; it omits this repo's
   Corepack setup steps (`npm install --global corepack@0.34.7`, `corepack
enable`, `corepack prepare pnpm@11.17.0 --activate`), which your app needs
   too if it pins pnpm the same way — see
   [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) for the full,
   working sequence rather than reconstructing it from this excerpt.

   `setup-node` writes a user-level npmrc that reads `NODE_AUTH_TOKEN` from
   the environment — this is a trusted source, unlike a project `.npmrc`
   doing the same thing.

3. **In Docker:** write `/root/.npmrc` from a BuildKit secret, in the _same_
   `RUN` step as the install that needs it, and remove it before the layer
   ends so the token never persists in an image layer. See Step 6 below for
   the exact snippet this repo uses.

Once the credential is in place, confirm it works before doing anything else
in this guide:

```bash
pnpm view @jainparichay/db version
```

If this prints a version, the credential is good. If it 401s, fix that now —
every later step assumes a working install, and diagnosing an auth failure
after eight steps of surgery on your app is much harder than catching it
here.

## Step 2: Exclude `@jainparichay/*` from any release-age quarantine

pnpm 11 enables a minimum release-age floor **by default**, even if your
`pnpm-workspace.yaml` never mentions `minimumReleaseAge` — it is not
something you have to opt into. Add the exclusion unconditionally on pnpm
11+:

```yaml
minimumReleaseAgeExclude:
  - '@jainparichay/*'
```

Without it, `pnpm install`/`pnpm fetch` rejects any `@jainparichay/*` version
published inside that default floor — which includes every version you
publish yourself, right when you'd want to consume it. This repo's
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) additionally sets an
explicit `minimumReleaseAge: 10080` (7 days) as its own third-party
supply-chain buffer, wider than pnpm's default; that explicit setting only
widens the window further, it is not what turns the protection on. The
exclusion is what makes `@jainparichay/*` exempt from whichever floor
applies, default or explicit, and both this repo's
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) and its
[`apps/web-host/Dockerfile`](../../apps/web-host/Dockerfile) (in the comment
above its `pnpm fetch` layer) call out what happens without it: the
quarantine rejects the lockfile.

## Step 3: Delete the app's local copies

Delete the app's local `packages/<name>` directories for anything that is
now published as pure mechanism — `i18n`, `storage`, `config-typescript`,
`ai`, and (if the app has one) `ui`. Do not keep them "just in case"; a
local workspace package and a `@jainparichay/*` dependency of the same
underlying code will silently diverge.

**`db` is the one exception — do not delete the app's Prisma schema.**
`@jainparichay/db` supplies only the database-connection mechanism
(`createDatabaseClient`, a thin wrapper around `@prisma/adapter-pg`); it
ships no `prisma/schema.prisma` and no migrations. If the app's local
`packages/db` bundled a hand-rolled connection helper alongside its schema,
delete only the helper and replace it with `@jainparichay/db` (see Step 5);
move the schema and migrations into the app itself (for example
`apps/<name>/prisma/`) if they aren't there already — they were never
something to delete, only something to stop nesting inside a shared
package.

If the app has a package that is genuinely app-specific (not something two
or more apps would share), keep it, but rename it under the app's own scope
and let it depend on `@jainparichay/*` instead of duplicating logic. This
repo's [`docs/guides/pnpm-workspace.md`](./pnpm-workspace.md) describes the
same pattern under "Adding A New Package": a local package that wraps or
extends a `@jainparichay/*` package with project-specific behavior is fine;
a local package that reimplements one is what this migration is meant to
end.

## Step 4: Replace `workspace:*` with the published version, and fix imports

In every `package.json` that depended on the local package via `workspace:*`
(or embedded its source directly), replace it with the published range:

```json
{
  "dependencies": {
    "@jainparichay/db": "^0.2.1",
    "@jainparichay/i18n": "^0.1.0"
  }
}
```

This repo's [`apps/api/package.json`](../../apps/api/package.json) and
[`apps/web/package.json`](../../apps/web/package.json) show the full
dependency shape after migration — `@jainparichay/*` packages sit in
`dependencies` (or `devDependencies` for `@jainparichay/config-typescript`)
next to `catalog:`-pinned third-party packages, while genuinely internal
workspace packages (for example `@workspace-starter/api` as a dependency of
`@workspace-starter/web-host`) keep `workspace:*`.

Then rewrite every import site: `@<your-old-scope>/<pkg>` becomes
`@jainparichay/<pkg>`. This includes non-obvious places:

- `tsconfig.json` `extends` paths (for example
  `@jainparichay/config-typescript/base.json`).
- Any `paths` alias in a `tsconfig.json` that pointed at the local package.
- Barrel re-exports.

A repo-wide search for the old scope string is the reliable way to catch
every site; don't rely on the compiler to find them all, since a stale
`tsconfig` path alias can resolve silently to a leftover local file instead
of erroring.

## Step 5: Migrating a Prisma (`@jainparichay/db`) consumer

The schema stays in your app. `@jainparichay/db` exports connection
**mechanism only** — `createDatabaseClient`, `createPgAdapter`, and
`requireDatabaseUrl`, built around `@prisma/adapter-pg` — and ships no
`prisma/schema.prisma`, no migrations, and no generated Prisma Client. If
you are migrating an app that was already on an older `@jainparichay/db`
(before `0.2.0`), this undoes that coupling rather than extending it: the
schema used to live inside the published package, and that is exactly the
part of the old design this migration exists to remove.

1. **Keep (or create) your app's own Prisma schema and migrations** under
   the app's own directory — for example `apps/<name>/prisma/schema.prisma`
   and `apps/<name>/prisma/migrations/`. This repo's
   [`apps/api/prisma/`](../../apps/api/prisma/) is the reference layout.
2. **Add `@prisma/adapter-pg` yourself.** `@jainparichay/db` declares it as
   a `peerDependency` (`^7.0.0`), not something it pulls in for you — add it
   to your app's `dependencies` alongside `prisma` and `@prisma/client`.
   This repo's [`apps/api/package.json`](../../apps/api/package.json) pins
   all three to the same `catalog:` entry.
3. **Wrap `@prisma/client` with `createDatabaseClient`,** not the other way
   around. This repo's
   [`apps/api/src/prisma/client.ts`](../../apps/api/src/prisma/client.ts)
   is the whole pattern:

   ```ts
   import { PrismaClient } from '@prisma/client';
   import { createDatabaseClient } from '@jainparichay/db';

   export const prisma = createDatabaseClient(
     (adapter) => new PrismaClient({ adapter }),
   );

   export type { PrismaClient };
   ```

   `createDatabaseClient` reads `DATABASE_URL` (or an explicit
   `connectionString` option) eagerly and throws if it's unset — this is
   this app's existing hard-fail-at-startup behavior, not a bug to work
   around with a placeholder. Outside production
   (`NODE_ENV !== 'production'`) it also caches the constructed client per
   connection string on `globalThis`, so a hot-reloading dev server doesn't
   open a new connection pool on every reload; pass `{ cache: false }` to
   opt out, or call `resetDatabaseClient()` to force a rebuild.
   `@jainparichay/db` ships both an ESM and a CommonJS entry, so a
   CommonJS app (like this repo's NestJS `apps/api`) can `require()`/import
   it directly — no `await import()` needed, unlike most other
   `@jainparichay/*` packages (see Step 8).

4. **Point `prisma.config.ts` at your own schema**, the ordinary Prisma way
   — there is no shared-package path to resolve, because the schema was
   never inside one to begin with. This repo's
   [`apps/api/prisma.config.ts`](../../apps/api/prisma.config.ts) is a
   plain `defineConfig({ schema: 'prisma/schema.prisma', migrations: {
path: 'prisma/migrations' }, datasource: { url: databaseUrl } })`; adjust
   the paths only if your schema lives somewhere other than `prisma/`
   relative to the app's own directory. Load `.env` from every `cwd` your
   app's scripts actually run with (see Step 9 below) — this repo's config
   loads both `.env` and `../../.env` for exactly that reason.
5. **Add a plain `postinstall`, and put `prisma` in `dependencies` — not
   `devDependencies`.** This repo's
   [`apps/api/package.json`](../../apps/api/package.json) does:

   ```json
   {
     "scripts": {
       "postinstall": "DATABASE_URL=\"${DATABASE_URL:-postgresql://placeholder}\" prisma generate"
     },
     "dependencies": {
       "prisma": "catalog:"
     }
   }
   ```

   The placeholder is still needed: `prisma.config.ts` throws if
   `DATABASE_URL` is unset even for `generate`, which never touches a
   database, and a fresh clone or CI checkout won't have a real one yet.
   `prisma` has to be a `dependency`, not a `devDependency`, even though it
   is only ever invoked at install/build/migrate time: `pnpm deploy --prod`
   strips `devDependencies` from the deployed tree, and this same
   `postinstall` runs again inside that deployed tree (see Step 6), where
   it needs `prisma` on `PATH`. Leaving `prisma` under `devDependencies` is
   exactly the mistake that broke `pnpm deploy --prod` for this app during
   this migration — don't repeat it.

There is no resolver script to route the convenience commands through
anymore; wire the root scripts straight to your app's own, the way this
repo's root [`package.json`](../../package.json) does:

```json
{
  "scripts": {
    "db:generate": "pnpm --filter <your-app-name> db:generate",
    "db:migrate": "pnpm --filter <your-app-name> db:migrate",
    "db:deploy": "pnpm --filter <your-app-name> db:deploy",
    "db:studio": "pnpm --filter <your-app-name> db:studio"
  }
}
```

and in the app itself, the way
[`apps/api/package.json`](../../apps/api/package.json) does:

```json
{
  "scripts": {
    "db:generate": "DATABASE_URL=\"${DATABASE_URL:-postgresql://placeholder}\" prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio"
  }
}
```

Add `allowBuilds` entries for the native toolchain Prisma pulls in, or the
very first install fails with `ERR_PNPM_IGNORED_BUILDS` (pnpm 11's
build-script approval gate blocks unrecognized native builds by default).
This repo's [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) does:

```yaml
allowBuilds:
  prisma: true
  '@prisma/engines': true
```

(This repo's own `allowBuilds` list also includes `@nestjs/core`, `esbuild`,
and `sharp` for reasons unrelated to Prisma — copy only what your build
actually needs.)

Two more things to update for a Prisma consumer:

- If your app is its own `pnpm deploy` root (the normal case — see Step 6),
  `docker-entrypoint.sh` needs no `cd` at all before `prisma migrate
deploy`: the schema and `node_modules/.bin` already live at the deploy
  root's `$PWD`. This repo's
  [`apps/api/docker-entrypoint.sh`](../../apps/api/docker-entrypoint.sh)
  does:

  ```sh
  PATH="$PWD/node_modules/.bin:$PATH"
  export PATH
  prisma migrate deploy
  ```

  Only `cd` into a nested directory if a _different_ app re-links yours as
  an embedded `workspace:*` dependency and deploys from its own root
  instead — see
  [`apps/web-host/docker-entrypoint.sh`](../../apps/web-host/docker-entrypoint.sh),
  which `cd`s into `node_modules/@workspace-starter/api` for exactly that
  reason, and Step 7 below for why.

- `DATABASE_URL` is required with no fallback for every real command
  (`migrate dev`, `migrate deploy`, `studio`) — only `generate` gets a
  placeholder. Make sure your environment setup docs and `.env.example`
  still set it before `db:deploy` is run for the first time; see this
  repo's [`.env.example`](../../.env.example) and the
  [env files note](#step-9-env-files-are-not-automatically-found) below if
  you use NestJS's `ConfigModule`.

## Step 6: Containers

The snippets below are illustrative; treat
[`docs/guides/deployment.md`](./deployment.md) (see its "Registry
authentication for container builds" and "Regenerating the Prisma Client
after `pnpm deploy`" sections) as the canonical, kept-current version and
copy from there rather than from two places that can drift apart.

Update every Dockerfile that installs dependencies for this app:

1. **Copy both `.npmrc` and `pnpm-workspace.yaml` into the install layer.**
   `.npmrc` supplies the registry mapping from Step 1; `pnpm-workspace.yaml`
   supplies the `minimumReleaseAgeExclude` from Step 2. Both are required at
   fetch/install time, not just at repo checkout time — without
   `pnpm-workspace.yaml` present in this layer, `pnpm fetch`/`pnpm install`
   falls back to the release-age floor with no exclusion and rejects your
   own just-published packages, exactly as
   [`apps/web-host/Dockerfile`](../../apps/web-host/Dockerfile)'s comment
   above its `pnpm fetch` step explains:

   ```dockerfile
   COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
   ```

   (This repo's own `apps/api/Dockerfile` also copies `turbo.json` here
   because this repo uses Turborepo; include it only if your app does too —
   an app without Turborepo will fail the build on a missing file if it
   blindly copies this line.)

2. **Supply the auth token from a BuildKit secret, in the same `RUN` as the
   install**, and remove it before the layer ends. This repo's
   [`apps/api/Dockerfile`](../../apps/api/Dockerfile) does:

   ```dockerfile
   RUN --mount=type=secret,id=node_auth_token \
       tok="$(cat /run/secrets/node_auth_token)"; \
       [ -n "$tok" ] || { echo "error: NODE_AUTH_TOKEN must be set to fetch @jainparichay/* from GitHub Packages" >&2; exit 1; }; \
       printf '//npm.pkg.github.com/:_authToken=%s\n' "$tok" > /root/.npmrc \
    && pnpm install --frozen-lockfile \
    && rm -f /root/.npmrc
   ```

   Build with `docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN`,
   or via `docker compose build` with the `secrets:` block already wired in
   this repo's [`docker-compose.yml`](../../docker-compose.yml) (it reads
   the `NODE_AUTH_TOKEN` environment variable). Failing fast on an empty
   token avoids a ~45-second wait for an unattributed 401 later in the
   build.

   If any COPY line in your Dockerfile lists individual
   `packages/<name>/package.json` files (a pattern from when those packages
   were local workspace members), delete those lines — they now point at
   directories that no longer exist and will fail the build outright.

3. **Regenerate the Prisma client after `pnpm deploy`, against your app's
   own deployed schema.** `pnpm deploy` rebuilds `node_modules` from the
   content-addressable store, which discards whatever Prisma Client was
   generated during the build (the generator has no custom `output`, so
   there's nothing else to preserve). Add this after your `pnpm deploy`
   step, `cd`ing into wherever your app's schema actually lands in the
   deployed tree — the same distinction as Step 5's entrypoint note. If
   your app is its own deploy root, as
   [`apps/api/Dockerfile`](../../apps/api/Dockerfile) is:

   ```dockerfile
   RUN cd -P /app \
    && DATABASE_URL="postgresql://placeholder" PATH="$PWD/node_modules/.bin:$PATH" prisma generate
   ```

   If a host app deploys your app as an embedded `workspace:*` dependency
   instead, as [`apps/web-host/Dockerfile`](../../apps/web-host/Dockerfile)
   does for `apps/api`:

   ```dockerfile
   RUN cd -P /app/node_modules/@workspace-starter/api \
    && DATABASE_URL="postgresql://placeholder" PATH="$PWD/node_modules/.bin:$PATH" prisma generate
   ```

4. **If a host app deploys an embedded `workspace:*` dependency that has its
   own Prisma `postinstall`, add `--ignore-scripts` to that `pnpm deploy`
   call.** This is Step 7's "host" case colliding with this step's
   container subsystem: `pnpm deploy` re-links an embedded `workspace:*`
   dependency (for example `apps/web-host`'s dependency on
   `@workspace-starter/api`) as a plain dependency of the deployed target
   rather than a workspace project. That subjects its `postinstall` to
   pnpm's build-script approval gate, and it fails with
   `ERR_PNPM_IGNORED_BUILDS` unless that dependency's name is listed in
   `allowBuilds` — which it normally isn't, since it's your own workspace
   package, not a third-party one you'd think to allow. This repo's
   [`apps/web-host/Dockerfile`](../../apps/web-host/Dockerfile) sidesteps
   this rather than adding an `allowBuilds` entry, because the
   `postinstall` in question only runs `prisma generate`, which the next
   `RUN` (the client-regenerate step above) redoes anyway:

   ```dockerfile
   RUN --mount=type=secret,id=node_auth_token \
       ... \
    && pnpm deploy --legacy --filter @workspace-starter/web-host --prod --ignore-scripts /app \
    && rm -f /root/.npmrc
   ```

   Only do this when you've confirmed the skipped `postinstall` is redundant
   with a regenerate step you already run (as in point 3 above) — otherwise
   `--ignore-scripts` silently drops whatever else that `postinstall` does.

5. **Expect a second, later auth prompt.** Once the full source tree lands
   in the image (after `COPY . .`), pnpm's automatic pre-run dependency
   check (`verify-deps-before-run`, on by default) notices workspace
   members that weren't part of the earlier lockfile-only layer and
   silently re-installs the full workspace before your build/test commands
   run — which needs registry auth again, for the same reason as the first
   install. `apps/api/Dockerfile` handles this with a second
   `RUN --mount=type=secret ...` block right before the build/deploy step;
   do the same rather than being surprised by an `ERR_PNPM_FETCH_401` deep
   into a build that appeared to already have working credentials.

## Step 7: A deployed host app must declare every `@jainparichay/*` package it serves at runtime

This is the bug that shipped **twice** during this migration, and both
times it was invisible to `pnpm build`, `pnpm typecheck`, `pnpm test`, and
CI — it only failed when the container actually ran.

If your app (call it a "host") serves another app's built output directly
out of its own deployed `node_modules` — for example, `apps/web-host` in
this repo runs `@workspace-starter/api` in-process as a `workspace:*`
dependency, and separately serves Astro apps' static/SSR output — then the
host's own `package.json` `dependencies` must include every
`@jainparichay/*` package that the served apps' _built output actually
resolves from the host's `node_modules` at runtime_ (Astro's SSR build
externalizes rather than bundles these, so the compiled server does a bare
`import` that Node resolves starting from wherever that file ends up), even
if the host's own code never imports them directly. `pnpm deploy --prod`
only installs what a package's own manifest declares; if the served app
needs `@jainparichay/db` but the host doesn't declare it, the host's
deployed image is missing it and fails at runtime with no earlier signal.
This does **not** extend to an embedded app's _other_ dependencies (e.g. a
NestJS API's own `@nestjs/*` packages) — those resolve from that app's own
nested `node_modules`, the same way any workspace package resolves its own
dependencies, and mirroring them into the host would just create a second,
independently-drifting copy of the served app's manifest.

Concretely: `apps/web` depends on `@jainparichay/{i18n,storage}`, and
`apps/web-host` serves its built output, so `apps/web-host`'s
`package.json` lists both as direct dependencies too (plus
`@jainparichay/db`, for `@workspace-starter/api`'s embedded dependency — a
separate instance of the same rule). The same applies to `react`/
`react-dom`, which Astro's SSR build externalizes the same way. Compare
[`apps/web/package.json`](../../apps/web/package.json) and
[`apps/web-host/package.json`](../../apps/web-host/package.json) in this
repo — the overlap is intentional and required, not duplication to clean
up. If your app adds `@jainparichay/ui` back (see the
`shared-ui-component` skill's note that no app here currently depends on
it), a host serving that app's output needs it mirrored the same way.

Copy the guardrail test that catches this automatically:
[`tests/repository-guardrails.test.mjs`](../../tests/repository-guardrails.test.mjs),
specifically the test named `'web-host mirrors the @jainparichay/*, react,
and react-dom dependencies resolved from its deploy root'`. It derives the
set of apps a host serves (either as an embedded `workspace:*` dependency,
or as staged Astro output) and asserts the host's manifest carries every
`@jainparichay/*`/`react`/`react-dom` dependency those apps declare, at the
matching version — deliberately not every dependency those apps have, only
the ones actually resolved from the host's own `node_modules`. Adapt both
the "which apps count as served" detection and the allowlist of guarded
package names to your own host's mechanism if it differs from this repo's
(for example, if your host also serves an app that externalizes a different
third-party package at build time).

## Step 8: ESM-only packages

Most `@jainparichay/*` packages are ESM-only **except** `@jainparichay/ui`
and `@jainparichay/db`, which both additionally ship a CommonJS-compatible
`require()` entry (this repo's CommonJS `apps/api` depends on
`@jainparichay/db` directly for exactly this reason — see Step 5). If any
part of your app is still CommonJS and needs `i18n`, `storage`, or `ai`,
replace `require('@jainparichay/ai')` with a dynamic import instead:

```js
const { createAiClient } = await import('@jainparichay/ai');
```

## Step 9: Env files are not automatically found

If your API framework resolves `.env` relative to its own process working
directory (NestJS's `ConfigModule.forRoot()` does this by default via
`resolve(process.cwd(), '.env')`), a root-level `.env` — the file your setup
docs likely tell readers to `cp .env.example .env` into — will silently not
be read once the app's own scripts run with the app's own directory as
`cwd` (a normal monorepo pattern). This repo's
[`apps/api/src/app.module.ts`](../../apps/api/src/app.module.ts) fixes this
by listing both candidate paths:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env', '../../.env'],
}),
```

`.env` covers the container image (where `cwd` is `/app`, so the file lands
right next to it); `../../.env` covers local development (where workspace
scripts run with `apps/api` as `cwd`, two levels below the repo root). List
whichever paths correspond to every context your app actually runs in — the
absent path is harmlessly ignored, but a missing one silently drops
`DATABASE_URL` and every other setting a reader assumes is loaded.

## Step 10: Install and verify

With the credential already set from Step 1 (locally, in your user-level
`~/.npmrc`):

```bash
pnpm install
pnpm typecheck
pnpm test
```

`pnpm install` triggers the `postinstall` from Step 5, which generates the
Prisma client against your app's own schema. If this fails with
`ERR_PNPM_FETCH_401`, re-check Step 1 — the most common cause is a token
that only exists as `NODE_AUTH_TOKEN` in your shell without ever landing in
a trusted npmrc.

`pnpm install` also rewrites `pnpm-lock.yaml` to record the new
`@jainparichay/*` resolutions. Commit that updated lockfile. CI runs `pnpm
install --frozen-lockfile` (see Step 11), which fails outright if the
lockfile on disk doesn't already match the manifests — an uncommitted
lockfile change here will pass locally and then break the very first CI run
after you push.

## Step 11: CI and deploy environments

Set `NODE_AUTH_TOKEN` in:

- The app's CI secrets (paired with `actions/setup-node`'s `registry-url`,
  per Step 1.2).
- Any deploy-time environment that runs `docker build` /
  `docker compose build` for this app (paired with the BuildKit secret
  wiring from Step 6).

## Upgrading later

Once migrated, upgrading a shared package is exactly what this whole
migration was for: bump the version range in the app's `package.json`
(or the pnpm catalog entry if you use one), run `pnpm install`, then run the
app's normal checks (`pnpm typecheck`, `pnpm test`, `pnpm build`). Never
copy package source between repos again — if a `@jainparichay/*` package
needs a behavior change, make it in
[the packages repo](https://github.com/JainParichay/packages) and publish a
new version; every consuming app picks it up the same way.
