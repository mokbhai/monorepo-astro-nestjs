# Migrating an existing app to `@jainparichay/*` shared packages

## Who this is for

You maintain an app that still carries its own local copies of what are now
the `@jainparichay/*` shared packages (`ui`, `types`, `i18n`, `storage`,
`db`, `config-typescript`, `ai`). Those packages used to live in every app's
own `packages/*` workspace; updating one meant hand-editing every app that
copied it. They have since been extracted into a separate public repo,
[github.com/JainParichay/packages](https://github.com/JainParichay/packages),
and published to GitHub Packages as `@jainparichay/<name>@0.1.0`. This
template (`template-jp`) has already been migrated to consume them — it is
the worked example this guide is drawn from. Every path, script, and snippet
below is copied from this repo's actual state, not from memory of the
migration.

Follow the steps in order. Each one calls out the specific mistake that cost
real debugging time during this migration, so skipping ahead is likely to
reproduce it.

## Prerequisites

- A GitHub personal access token with `read:packages` scope (the
  `@jainparichay/*` packages are public, but GitHub Packages still requires
  authentication to fetch them).
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
     - uses: actions/setup-node@v7
       with:
         node-version: 22.13.0
         registry-url: https://npm.pkg.github.com
     - run: pnpm install --frozen-lockfile
   ```

   `setup-node` writes a user-level npmrc that reads `NODE_AUTH_TOKEN` from
   the environment — this is a trusted source, unlike a project `.npmrc`
   doing the same thing.

3. **In Docker:** write `/root/.npmrc` from a BuildKit secret, in the _same_
   `RUN` step as the install that needs it, and remove it before the layer
   ends so the token never persists in an image layer. See Step 6 below for
   the exact snippet this repo uses.

## Step 2: Exclude `@jainparichay/*` from any release-age quarantine

If your `pnpm-workspace.yaml` sets `minimumReleaseAge` (a supply-chain
buffer that refuses to resolve packages published too recently), add:

```yaml
minimumReleaseAgeExclude:
  - '@jainparichay/*'
```

This repo's [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) sets
`minimumReleaseAge: 10080` (7 days) as a third-party supply-chain buffer,
with exactly this exclusion for `@jainparichay/*` — those are your own
published output, not a third-party risk, and without the exclusion a
version you just published stays unresolvable to your own apps until the
window elapses. If your app has no `minimumReleaseAge` setting, skip this
step.

## Step 3: Delete the app's local copies

Delete the app's local `packages/<name>` directories for anything that is
now published — `db`, `ui`, `types`, `i18n`, `storage`, `config-typescript`,
`ai`. Do not keep them "just in case"; a local workspace package and a
`@jainparichay/*` dependency of the same underlying code will silently
diverge.

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
    "@jainparichay/db": "^0.1.0",
    "@jainparichay/types": "^0.1.0"
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

This is the step most likely to go wrong, because the schema now lives
_inside_ the published package rather than in your app's own `prisma/`
folder, and three subtleties compound:

1. `@jainparichay/db` is not guaranteed to be hoisted to your workspace
   root — don't hardcode a path like
   `node_modules/@jainparichay/db/prisma/schema.prisma` relative to the
   workspace root or the app directory.
2. Running the `prisma` CLI with your app's own directory as `cwd` cannot
   resolve `@prisma/client`, because `@prisma/client` is a dependency of
   `@jainparichay/db`, not of your app — module resolution from your app's
   directory never reaches it.
3. `@jainparichay/db`'s `prisma.config.ts` throws if `DATABASE_URL` is
   unset — and it's loaded even for `generate`, which never touches a
   database. If your app runs `prisma generate` from a `postinstall` script
   without a placeholder, `pnpm install` itself breaks on any machine or CI
   run that hasn't set `DATABASE_URL` yet (which is the normal state before
   your app's first `.env` is created).

Don't hand-roll a fix for these. Copy
[`scripts/prisma.mjs`](../../scripts/prisma.mjs) into your app verbatim (or
via a shared internal tool if you maintain more than one Prisma-consuming
app). It resolves `@jainparichay/db`'s on-disk directory by walking Node's
own module-resolution search paths (survives hoisting changes), runs the
`prisma` CLI with that directory as `cwd` (so `@prisma/client` resolves and
`prisma.config.ts`'s `schema`/`migrations.path` fields are honored), and
substitutes a placeholder `DATABASE_URL` only for `generate` while requiring
a real one for every other subcommand.

Wire it up the way this repo's root [`package.json`](../../package.json)
does:

```json
{
  "scripts": {
    "db:generate": "node scripts/prisma.mjs generate",
    "db:migrate": "node scripts/prisma.mjs migrate dev",
    "db:deploy": "node scripts/prisma.mjs migrate deploy",
    "db:studio": "node scripts/prisma.mjs studio"
  }
}
```

And add a `postinstall` plus the `prisma` devDependency to the app that owns
the Prisma schema consumption, the way
[`apps/api/package.json`](../../apps/api/package.json) does:

```json
{
  "scripts": {
    "postinstall": "node ../../scripts/prisma.mjs generate"
  },
  "devDependencies": {
    "prisma": "catalog:"
  }
}
```

(Adjust the relative path to `scripts/prisma.mjs` if your app lives at a
different depth than `apps/<name>`.)

Two more things to update for a Prisma consumer:

- Any `docker-entrypoint.sh` that `cd`s into a local `prisma/` folder before
  running `prisma migrate deploy` must instead `cd` into the deployed
  package directory. This repo's
  [`apps/api/docker-entrypoint.sh`](../../apps/api/docker-entrypoint.sh) and
  [`apps/web-host/docker-entrypoint.sh`](../../apps/web-host/docker-entrypoint.sh)
  both do:

  ```sh
  cd -P /app/node_modules/@jainparichay/db
  PATH="$PWD/node_modules/.bin:$PATH"
  export PATH
  prisma migrate deploy
  ```

- `DATABASE_URL` is now required with no fallback for every real command
  (`migrate dev`, `migrate deploy`, `studio`) — only `generate` gets a
  placeholder. Make sure your environment setup docs and `.env.example`
  still set it before `db:deploy` is run for the first time; see this
  repo's [`.env.example`](../../.env.example) and the
  [env files note](#step-9-env-files-are-not-automatically-found) below if
  you use NestJS's `ConfigModule`.

## Step 6: Containers

Update every Dockerfile that installs dependencies for this app:

1. **Copy `.npmrc` into the install layer** so the registry mapping from
   Step 1 is present:

   ```dockerfile
   COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
   ```

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

3. **Regenerate the Prisma client after `pnpm deploy`.** `pnpm deploy`
   rebuilds `node_modules` from the content-addressable store, which
   discards whatever Prisma Client was generated during the build (the
   generator has no custom `output`, so there's nothing else to preserve).
   Add this after your `pnpm deploy` step, exactly as both
   [`apps/api/Dockerfile`](../../apps/api/Dockerfile) and
   [`apps/web-host/Dockerfile`](../../apps/web-host/Dockerfile) do:

   ```dockerfile
   RUN cd -P /app/node_modules/@jainparichay/db \
    && DATABASE_URL="postgresql://placeholder" PATH="$PWD/node_modules/.bin:$PATH" prisma generate
   ```

4. **Expect a second, later auth prompt.** Once the full source tree lands
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
`@jainparichay/*` package that the apps it serves depend on, even if the
host's own code never imports them directly. `pnpm deploy --prod` only
installs what a package's own manifest declares; if the served app needs
`@jainparichay/db` but the host doesn't declare it, the host's deployed
image is missing it and fails at runtime with no earlier signal.

Concretely: if `apps/web` depends on `@jainparichay/{i18n,storage,types,ui}`
and `apps/web-host` serves its built output, `apps/web-host`'s
`package.json` must list all four as direct dependencies too. Compare
[`apps/web/package.json`](../../apps/web/package.json) and
[`apps/web-host/package.json`](../../apps/web-host/package.json) in this
repo — the overlap is intentional and required, not duplication to clean
up.

Copy the guardrail test that catches this automatically:
[`tests/repository-guardrails.test.mjs`](../../tests/repository-guardrails.test.mjs),
specifically the test named `'web-host mirrors every @jainparichay/*
runtime dependency of the apps it serves'`. It derives the set of apps a
host serves (either as an embedded `workspace:*` dependency, or as staged
Astro output) and asserts the host's manifest carries every
`@jainparichay/*` dependency those apps declare, at the matching version.
Adapt the "which apps count as served" detection to your own host's
mechanism if it differs from this repo's.

## Step 8: ESM-only packages

All `@jainparichay/*` packages are ESM-only **except** `@jainparichay/ui`.
If any part of your app is still CommonJS, replace `require('@jainparichay/db')`
(or `i18n`, `storage`, `types`, `ai`) with a dynamic import:

```js
const { createAiClient } = await import('@jainparichay/ai');
```

`@jainparichay/ui` is the only package that also ships a CommonJS-compatible
entry, so it can still be `require()`'d if needed.

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
Prisma client against the published schema. If this fails with
`ERR_PNPM_FETCH_401`, re-check Step 1 — the most common cause is a token
that only exists as `NODE_AUTH_TOKEN` in your shell without ever landing in
a trusted npmrc.

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
