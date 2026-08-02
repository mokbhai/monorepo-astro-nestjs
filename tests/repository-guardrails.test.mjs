import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const rootDir = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function listPackageJsonFiles(directory) {
  let entries;
  try {
    entries = await readdir(new URL(`${directory}/`, rootDir), {
      withFileTypes: true,
    });
  } catch (error) {
    // Self-healing: `packages/` does not exist by default in this repo
    // anymore (shared libraries are external `@jainparichay/*` dependencies),
    // but the docs explicitly tell readers they may add their own
    // `packages/<name>` workspace. If they do, this directory reappears and
    // should automatically come back under the invariants below — only a
    // genuinely missing directory should be silently skipped, not any other
    // failure.
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}/package.json`);
}

test('root exposes repository guardrail scripts with pinned tooling', async () => {
  const pkg = await readJson('package.json');

  assert.equal(pkg.packageManager, 'pnpm@11.17.0');
  assert.equal(pkg.engines?.node, '>=22.13.0');
  assert.equal(pkg.engines?.pnpm, '>=11.17.0 <12');
  assert.equal(pkg.devDependencies?.prettier, 'catalog:dev-tools');
  assert.equal(
    pkg.devDependencies?.['prettier-plugin-astro'],
    'catalog:dev-tools',
  );

  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm lint/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm format:check/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm typecheck/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /git diff --check/);
  assert.match(pkg.scripts?.format ?? '', /prettier --write/);
  assert.match(pkg.scripts?.['format:check'] ?? '', /prettier --check/);
  assert.equal(
    pkg.scripts?.['template:remove-web-apps'],
    'node scripts/template/remove-web-apps.mjs',
  );
  assert.equal(
    pkg.scripts?.['template:remove-web-apps:dry-run'],
    'node scripts/template/remove-web-apps.mjs --dry-run',
  );
  assert.match(pkg.scripts?.verify ?? '', /pnpm verify:fast/);
  assert.match(pkg.scripts?.verify ?? '', /pnpm build/);
  assert.match(pkg.scripts?.verify ?? '', /pnpm test/);
  assert.match(
    pkg.scripts?.['hooks:install'] ?? '',
    /core\.hooksPath .githooks/,
  );
});

test('local Git hooks call the repository verification scripts', async () => {
  const [preCommit, prePush, preCommitStat, prePushStat] = await Promise.all([
    readText('.githooks/pre-commit'),
    readText('.githooks/pre-push'),
    stat(new URL('.githooks/pre-commit', rootDir)),
    stat(new URL('.githooks/pre-push', rootDir)),
  ]);

  assert.match(preCommit, /pnpm verify:fast/);
  assert.match(prePush, /pnpm verify/);
  assert.notEqual(
    preCommitStat.mode & 0o111,
    0,
    'pre-commit should be executable',
  );
  assert.notEqual(prePushStat.mode & 0o111, 0, 'pre-push should be executable');
});

test('GitHub CI runs the same repository verification command', async () => {
  const workflow = await readText('.github/workflows/ci.yml');
  const corepackInstallIndex = workflow.indexOf(
    'npm install --global corepack@0.34.7',
  );
  const pnpmPrepareIndex = workflow.indexOf(
    'corepack prepare pnpm@11.17.0 --activate',
  );

  assert.match(workflow, /node-version: 22\.13\.0/);
  assert.notEqual(corepackInstallIndex, -1);
  assert.notEqual(pnpmPrepareIndex, -1);
  assert.ok(
    corepackInstallIndex < pnpmPrepareIndex,
    'GitHub CI should update Corepack before preparing pinned pnpm',
  );
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm verify/);
});

test('build-and-publish workflow is manual, configurable, and publish-only', async () => {
  const workflow = await readText('.github/workflows/build-and-publish.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /workflow_run:/);
  assert.match(workflow, /ref:/);
  assert.match(workflow, /apps:/);
  assert.match(workflow, /public_api_url:/);
  assert.match(workflow, /primary_frontend:/);

  // Images remain convention-driven and retain immutable SHA and latest tags.
  assert.match(workflow, /find apps -maxdepth 2 -name Dockerfile/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /docker\/build-push-action/);
  assert.match(workflow, /PUBLIC_API_URL=\$\{\{ inputs\.public_api_url \}\}/);
  assert.match(
    workflow,
    /PRIMARY_FRONTEND=\$\{\{ inputs\.primary_frontend \}\}/,
  );
  assert.match(workflow, /needs\.discover\.outputs\.sha/);
  assert.match(workflow, /:latest/);

  assert.doesNotMatch(workflow, /node scripts\/deploy\/run\.mjs/);
  assert.doesNotMatch(workflow, /^\s{2}deploy:/m);
});

test('web-host uses the selected primary frontend at build time and runtime', async () => {
  const dockerfile = await readText('apps/web-host/Dockerfile');

  assert.match(dockerfile, /ARG PRIMARY_FRONTEND=web/);
  assert.match(dockerfile, /ENV PRIMARY_FRONTEND=\$\{PRIMARY_FRONTEND\}/);
  assert.doesNotMatch(dockerfile, /ENV PRIMARY_FRONTEND=web/);
});

test('deployment is convention-driven by apps/<name>/Dockerfile', async () => {
  // Frontends are aggregated behind web-host, so they ship no individual
  // Dockerfile; web-host and the api do.
  assert.equal(
    await stat(new URL('apps/web/Dockerfile', rootDir))
      .then(() => true)
      .catch(() => false),
    false,
    'apps/web should not have its own Dockerfile (it is bundled by web-host)',
  );
  await stat(new URL('apps/web-host/Dockerfile', rootDir));
  await stat(new URL('apps/api/Dockerfile', rootDir));
});

test('combined web-host image deploys API, frontend, and migration runtime dependencies', async () => {
  const [dockerfile, entrypoint, manifest] = await Promise.all([
    readText('apps/web-host/Dockerfile'),
    readText('apps/web-host/docker-entrypoint.sh'),
    readJson('apps/web-host/package.json'),
  ]);

  assert.equal(manifest.dependencies['@workspace-starter/api'], 'workspace:*');
  assert.equal(manifest.dependencies['@workspace-starter/web'], 'workspace:*');
  assert.match(
    dockerfile,
    /pnpm deploy --legacy --filter @workspace-starter\/web-host --prod --ignore-scripts \/app/,
  );
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app \/app/);
  assert.match(dockerfile, /CMD \["\/usr\/local\/bin\/web-host-entrypoint"\]/);
  const migrateIndex = entrypoint.indexOf('prisma migrate deploy');
  const hostIndex = entrypoint.indexOf('exec node /app/dist/server.js');
  assert.notEqual(migrateIndex, -1);
  assert.notEqual(hostIndex, -1);
  assert.ok(migrateIndex < hostIndex);
  // web-host re-links its @workspace-starter/api workspace dependency as a
  // plain dependency of the deploy root, so the api's own schema (and its
  // node_modules/.bin) land under node_modules/@workspace-starter/api
  // rather than at the deploy root itself.
  assert.match(entrypoint, /node_modules\/@workspace-starter\/api/);
  // `pnpm deploy` discards the Prisma Client generated during the build (it
  // re-links node_modules from the store), so the image must regenerate it
  // against the deployed tree — commit 81417a8's second defect was exactly
  // this step silently missing.
  assert.match(dockerfile, /prisma generate/);
});

test('api production startup applies migrations before starting the server', async () => {
  const [dockerfile, entrypoint] = await Promise.all([
    readText('apps/api/Dockerfile'),
    readText('apps/api/docker-entrypoint.sh'),
  ]);

  assert.match(dockerfile, /CMD \["\/usr\/local\/bin\/api-entrypoint"\]/);
  assert.doesNotMatch(dockerfile, /ENTRYPOINT/);

  const migrateIndex = entrypoint.indexOf('prisma migrate deploy');
  const apiIndex = entrypoint.indexOf('exec node /app/dist/main');
  assert.match(entrypoint, /^#!\/bin\/sh\nset -eu\n/);
  // apps/api is its own deploy root (see Dockerfile), so its schema and
  // node_modules/.bin already live at $PWD (WORKDIR /app) — a `cd` into a
  // nested package isn't needed here the way it is in the web-host
  // entrypoint above, but this deliberately does not forbid one (e.g. an
  // explicit `cd -P /app`): that form is strictly safer against a changed
  // WORKDIR than relying on it implicitly, so the real invariant to assert
  // is what actually matters for safety — migrations run before the server
  // starts, and a failed migration cannot be silently bypassed.
  assert.match(entrypoint, /PATH="\$PWD\/node_modules\/\.bin:\$PATH"/);
  assert.notEqual(migrateIndex, -1);
  assert.notEqual(apiIndex, -1);
  assert.ok(migrateIndex < apiIndex, 'migrations must run before API startup');
  assert.doesNotMatch(
    entrypoint,
    /\|\||;/,
    'migration failure must stop startup',
  );
  // Same rationale as the web-host Dockerfile test above: `pnpm deploy`
  // discards the build-time Prisma Client, so the image must regenerate it.
  assert.match(dockerfile, /prisma generate/);
});

// This test copies the whole workspace (minus `.git`/`.turbo`/`node_modules`)
// and runs a full `pnpm install --frozen-lockfile` before `pnpm deploy`,
// mirroring the real sequence in `apps/api/Dockerfile` (which runs a full
// install against the complete source tree before its `pnpm deploy` step).
// That install is not optional overhead: apps/api's schema now lives in the
// app itself (`apps/api/prisma/`), and its `postinstall` is a plain
// `prisma generate` with no fallback for an uninstalled tree (unlike the
// `scripts/prisma.mjs` this replaced, which special-cased a missing
// `apps/api/node_modules` as a `pnpm deploy` "source pass" no-op). Skipping
// the install and jumping straight to `pnpm deploy` reproduces this exactly:
// `pnpm deploy` resolves and links `apps/api`'s dependencies (including
// `prisma`) into the isolated tree as part of the same operation, but at
// the moment the postinstall script runs, the `prisma` binary is not yet
// linked into `node_modules/.bin`, so it fails with `sh: prisma: command
// not found` — even though `prisma` is correctly declared in `dependencies`
// (confirmed by reproducing this directly: the failure disappears once a
// full install precedes `pnpm deploy`, and reappears if that install is
// removed). A preceding full install avoids this ordering gap entirely,
// exactly as the Dockerfiles' own build sequence does.
//
// This is a distinct failure mode from `prisma` being misplaced under
// `devDependencies` (see the migrating-apps guide's Step 5), but the two
// share the exact same downstream symptom if either regresses silently:
// `pnpm deploy --prod` itself keeps exiting `0` in both cases, and the
// actual breakage only surfaces afterward, at `apps/api/Dockerfile`'s
// post-deploy `prisma generate` regenerate step and
// `apps/api/docker-entrypoint.sh`'s `prisma migrate deploy` — both fail
// with "command not found" once `node_modules/.bin/prisma` is missing from
// the deployed tree. This test's assertions (below) are what actually catch
// that, since `pnpm deploy`'s own exit code does not.
test('api production deploy includes a runnable Prisma migration artifact', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'api-production-deploy-'));
  const isolatedRepoDir = path.join(tempDir, 'repo');
  const deployDir = path.join(tempDir, 'deploy');
  const sourceRoot = fileURLToPath(rootDir);

  try {
    await cp(sourceRoot, isolatedRepoDir, {
      recursive: true,
      filter(source) {
        const relativePath = path.relative(sourceRoot, source);
        return !relativePath
          .split(path.sep)
          .some((part) => ['.git', '.turbo', 'node_modules'].includes(part));
      },
    });

    await execFileAsync('corepack', ['pnpm', 'install', '--frozen-lockfile'], {
      cwd: isolatedRepoDir,
    });

    await execFileAsync(
      'corepack',
      [
        'pnpm',
        'deploy',
        '--legacy',
        '--filter',
        '@workspace-starter/api',
        '--prod',
        deployDir,
      ],
      { cwd: isolatedRepoDir },
    );

    // apps/api is its own deploy root (see apps/api/Dockerfile and
    // docker-entrypoint.sh), so its schema, migrations, and
    // `prisma.config.ts` land directly under the deploy root rather than
    // nested inside a `@jainparichay/db` package directory — the schema is
    // app-owned now, not shipped by the shared package.
    await Promise.all([
      stat(path.join(deployDir, 'prisma.config.ts')),
      stat(path.join(deployDir, 'prisma', 'schema.prisma')),
      stat(
        path.join(
          deployDir,
          'prisma',
          'migrations',
          '20250629120000_init',
          'migration.sql',
        ),
      ),
    ]);

    // `apps/api`'s `prisma.config.ts` falls back to a placeholder connection
    // string when `DATABASE_URL` is unset (it loads config eagerly, even for
    // `--version`), so this deliberately runs with no `DATABASE_URL` set at
    // all — proving the fallback, not just that a value happens to be
    // present. `--version` never connects to a database. No `cd` is needed
    // (unlike the web-host case elsewhere in this file) because apps/api is
    // the deploy root itself.
    const envWithoutDatabaseUrl = { ...process.env };
    delete envWithoutDatabaseUrl.DATABASE_URL;
    const { stdout } = await execFileAsync(
      '/bin/sh',
      ['-c', 'PATH="$PWD/node_modules/.bin:$PATH" prisma --version'],
      {
        cwd: deployDir,
        env: envWithoutDatabaseUrl,
      },
    );
    assert.match(stdout, /prisma\s+: 7\./);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// This is (at least) the third time this project has shipped a "works when
// DATABASE_URL is exported into the shell, fails when it only lives in the
// documented `.env` file" bug. `apps/api/src/prisma/client.ts` calls
// `createDatabaseClient` at *module-evaluation time*, and in the emitted
// CommonJS, `require`s run top-to-bottom before the rest of a file's own
// body executes — so the require chain `bootstrap.ts` → `./app.module` →
// `./prisma/prisma.module` → `./prisma/client` reaches that eager call
// before `app.module.ts`'s own `@Module({...})` decorator (further down the
// same file) invokes `ConfigModule.forRoot({ envFilePath: [...] })`, which
// is what actually reads `.env` into `process.env`. A newcomer following
// the README (`cp .env.example .env` → `pnpm install` → `pnpm db:deploy` →
// `pnpm dev`/`pnpm start`) never exports `DATABASE_URL` as a real
// environment variable — it only ever lives in that `.env` file — so every
// *other* test in this suite that verifies startup/build behavior with
// `DATABASE_URL` present in `process.env` (exported by the test runner's own
// environment, or passed explicitly, as in the deploy test above) is blind
// to this exact failure shape. `apps/api/src/load-env.ts`, imported first in
// `bootstrap.ts` specifically so it runs before that require chain reaches
// `./app.module`, fixes this by loading `.env` synchronously up front. This
// test proves it: it requires the *built* `dist/bootstrap.js` (not
// `dist/main.js` — this must never attempt an actual `NestFactory.create` or
// database connection, only the module-evaluation-time require chain) from
// a sandboxed directory containing nothing but a `.env` file and symlinked
// `node_modules`/`dist`, with `DATABASE_URL` deliberately absent from the
// child process's own environment. Revert `bootstrap.ts`'s `./load-env`
// import (or delete `load-env.ts`) and this test fails with the same
// `@jainparichay/db: no database URL` error a real `pnpm dev`/`pnpm start`
// would throw.
test('api bootstrap does not require an exported DATABASE_URL — a .env file is enough', async () => {
  const apiDir = fileURLToPath(new URL('apps/api/', rootDir));
  const nestBin = path.join(apiDir, 'node_modules', '.bin', 'nest');

  // Always rebuild so this checks the current source, not a stale `dist/`
  // left over from an unrelated previous run — this test must fail whenever
  // the fix it guards is reverted, regardless of what ran before it.
  await execFileAsync(nestBin, ['build'], { cwd: apiDir });

  const sandboxDir = await mkdtemp(path.join(tmpdir(), 'api-env-shape-'));
  try {
    // Symlinked, not copied: bare-specifier requires (`@nestjs/core`,
    // `@jainparichay/db`, ...) inside `dist/` must resolve exactly the way
    // they do for the real app, and relative requires between compiled
    // files (`./load-env`, `./app.module`, ...) need the real directory
    // structure intact.
    await symlink(
      path.join(apiDir, 'node_modules'),
      path.join(sandboxDir, 'node_modules'),
      'dir',
    );
    await symlink(
      path.join(apiDir, 'dist'),
      path.join(sandboxDir, 'dist'),
      'dir',
    );
    // The only `DATABASE_URL` source available to the child process: a
    // `.env` file at the sandbox root, found via `load-env.ts`'s own
    // `['.env', '../../.env']` search (resolved relative to `cwd`, which is
    // this sandbox). No ambient `.env` from this repo's real working tree
    // is reachable from here.
    await writeFile(
      path.join(sandboxDir, '.env'),
      'DATABASE_URL=postgresql://placeholder@localhost:5432/env-shape-check\n',
    );

    const sandboxEnv = { ...process.env };
    delete sandboxEnv.DATABASE_URL;

    // Success is simply not throwing: `execFileAsync` rejects (and fails
    // this test) if the child process exits non-zero, which is exactly what
    // happens when `createDatabaseClient` throws at require time.
    await execFileAsync('node', ['-e', "require('./dist/bootstrap.js')"], {
      cwd: sandboxDir,
      env: sandboxEnv,
    });
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

// `@jainparichay/db@0.2.1` deliberately ships no Prisma schema of its own —
// the schema is app-owned (see `apps/api/prisma/`). This guards against a
// future published version quietly re-introducing one, which would silently
// resurrect the exact coupling (a shared package's schema needing to match
// one app's data model) that this migration removed. Resolve the installed
// package's location via Node's own module resolution (survives hoisting
// differences) rather than hardcoding a `node_modules` path.
// Resolves upward from a file to the nearest ancestor directory containing
// a `package.json` — the package root, however many directories deep the
// package's own entry point happens to live (today it's one level, under
// `dist/`; asserting a fixed depth would let this test silently stop
// checking anything, and pass, the moment the package restructures).
async function findPackageRoot(fromFile) {
  let dir = path.dirname(fromFile);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hasPackageJson = await stat(path.join(dir, 'package.json'))
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (hasPackageJson) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No package.json found above ${fromFile}`);
    }
    dir = parent;
  }
}

test('@jainparichay/db ships no prisma/ directory or PrismaClient export (mechanism only)', async (t) => {
  const apiPackageJsonPath = fileURLToPath(
    new URL('apps/api/package.json', rootDir),
  );
  const require = createRequire(apiPackageJsonPath);
  let dbEntryPoint;

  try {
    dbEntryPoint = require.resolve('@jainparichay/db');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      t.skip('@jainparichay/db is not installed (run `pnpm install` first)');
      return;
    }
    throw error;
  }

  const dbPackageRoot = await findPackageRoot(dbEntryPoint);
  const hasPrismaDirectory = await stat(path.join(dbPackageRoot, 'prisma'))
    .then((stats) => stats.isDirectory())
    .catch(() => false);

  assert.equal(
    hasPrismaDirectory,
    false,
    '@jainparichay/db must not ship a prisma/ directory — schemas belong ' +
      "in the consuming app's own package",
  );

  // The other half of the leak this guards against: even without a shipped
  // schema, re-exporting a generated `PrismaClient` would couple every
  // consumer to one specific schema shape baked into the shared package.
  const dbModule = require('@jainparichay/db');
  assert.equal(
    'PrismaClient' in dbModule,
    false,
    '@jainparichay/db must not export a PrismaClient — that would bake one ' +
      "consumer's schema into the shared package",
  );
});

test('workspace package manifests keep shared graph invariants', async () => {
  // Shared libraries used to live in `packages/*` as workspace members; they
  // are now published externally as `@jainparichay/*` (see
  // docs/guides/pnpm-workspace.md), so `packages/*` does not exist by
  // default. Docs explicitly tell readers they may add their own
  // `packages/<name>` workspace, though, so `listPackageJsonFiles` degrades
  // to an empty list rather than failing when the directory is absent —
  // these invariants apply automatically again the moment one is added.
  const packageFiles = [
    ...(await listPackageJsonFiles('apps')),
    ...(await listPackageJsonFiles('packages')),
  ];
  const manifests = await Promise.all(
    packageFiles.map(async (file) => [file, await readJson(file)]),
  );
  const workspaceNames = new Set(manifests.map(([, pkg]) => pkg.name));

  for (const [file, pkg] of manifests) {
    const hasSource = await stat(new URL(`${path.dirname(file)}/src`, rootDir))
      .then((stats) => stats.isDirectory())
      .catch(() => false);

    if (hasSource) {
      assert.equal(
        typeof pkg.scripts?.lint,
        'string',
        `${file} should expose a lint script`,
      );
      assert.equal(
        typeof pkg.scripts?.typecheck,
        'string',
        `${file} should expose a typecheck script`,
      );
    }

    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const [dependencyName, version] of Object.entries(
        pkg[field] ?? {},
      )) {
        if (workspaceNames.has(dependencyName)) {
          assert.equal(
            version,
            'workspace:*',
            `${file} should link ${dependencyName} with workspace:*`,
          );
        }
      }
    }
  }
});

async function isAstroApp(appName) {
  // Detect Astro apps structurally (presence of an astro config file) rather
  // than by name, so this keeps working if apps are added, renamed, or
  // removed. Match the filename pattern instead of enumerating extensions so
  // less common ones (`.mts`, `.cts`) are covered too.
  const appDirEntries = await readdir(new URL(`apps/${appName}/`, rootDir), {
    withFileTypes: true,
  }).catch(() => []);

  return appDirEntries.some(
    (entry) => entry.isFile() && /^astro\.config\./.test(entry.name),
  );
}

// `apps/web-host` serves other apps' built/runtime output directly out of its
// own deployed `node_modules` (see docker-entrypoint.sh / Dockerfile) in two
// ways: Astro apps are staged into it as static/SSR output, and it also
// embeds `@workspace-starter/api` as a `workspace:*` dependency that runs
// in-process (per #20's combined Astro/NestJS host). Only the first of these
// two ways puts a dependency's resolution root at web-host's own deploy-root
// `node_modules`: Astro's SSR build *externalizes* `@jainparichay/*` and
// `react`/`react-dom` rather than bundling them, so the built `dist/server`
// does a bare `import` that Node resolves starting from wherever that
// compiled file physically ends up on disk — which is a plain copy nested
// under web-host's own directory tree (see `scripts/build-frontends.mjs`),
// not a pnpm-linked package with its own `node_modules`. That walk up the
// directory tree lands on web-host's own top-level `node_modules`, so those
// three names must be declared there.
//
// The embedded case is different in kind, not degree: `@workspace-starter/api`
// is installed as a real pnpm dependency (a `workspace:*` package, complete
// with pnpm's isolated per-package `node_modules`), so it resolves *its own*
// dependencies — `@jainparichay/db` included — from its own nested
// `node_modules`/`.pnpm` linkage, exactly the way `@nestjs/*`, `@trpc/server`,
// `rxjs`, etc. already do. Mirroring any of an embedded app's own
// dependencies into the host is therefore never required by the runtime, and
// only creates a second, independently-drifting copy of that app's manifest.
// This was verified empirically, not just reasoned about: `pnpm deploy
// --legacy --filter @workspace-starter/web-host --prod` was run against a
// copy of this repo with `@jainparichay/db` removed from
// `apps/web-host/package.json`, and `node`'s own resolution of
// `await import('@workspace-starter/api')` from the deployed tree still
// found `@jainparichay/db` via `@workspace-starter/api`'s own nested
// `node_modules/.pnpm` entry — then the full combined host (`dist/server.js`)
// was started from that deploy and answered an HTTP request successfully
// with no `@jainparichay/db` anywhere in web-host's own `node_modules`.
// `apps/web-host/package.json` no longer declares `@jainparichay/db` as a
// result (see `docs/guides/migrating-apps-to-shared-packages.md` Step 7,
// which used to claim both mechanisms in the same breath — this test and
// that doc must keep telling the same story).
//
// Commit 81417a8 (apps/api's `@workspace-starter/db` gap, from *before* this
// distinction was drawn) and the Task 11 web-host 500 (apps/web's
// `@jainparichay/{i18n,storage,types,ui}` gap) both shipped with `pnpm
// build`/`typecheck`/`test`/CI green and only failed at container runtime
// because this mirror silently drifted — both were Astro-output gaps, which
// is exactly the class this test still guards.
test('web-host mirrors the @jainparichay/*, react, and react-dom dependencies that Astro SSR output externalizes from its deploy root', async () => {
  const appNames = (
    await readdir(new URL('apps/', rootDir), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((appName) => appName !== 'web-host');

  const webHostManifest = await readJson('apps/web-host/package.json');
  const webHostDependencies = webHostManifest.dependencies ?? {};

  for (const appName of appNames) {
    if (!(await isAstroApp(appName))) {
      continue;
    }

    const manifest = await readJson(`apps/${appName}/package.json`);
    const dependencies = manifest.dependencies ?? {};

    for (const [dependencyName, version] of Object.entries(dependencies)) {
      const isResolvedFromWebHostDeployRoot =
        dependencyName.startsWith('@jainparichay/') ||
        dependencyName === 'react' ||
        dependencyName === 'react-dom';

      if (!isResolvedFromWebHostDeployRoot) {
        continue;
      }

      assert.equal(
        webHostDependencies[dependencyName],
        version,
        `apps/web-host must declare ${dependencyName}@${version} in dependencies ` +
          `(apps/${appName}'s Astro SSR output resolves it from web-host's own node_modules at runtime)`,
      );
    }
  }
});

test('root Turbo invocations reference configured tasks', async () => {
  const [pkg, turbo] = await Promise.all([
    readJson('package.json'),
    readJson('turbo.json'),
  ]);
  const taskNames = new Set(Object.keys(turbo.tasks ?? {}));

  for (const [scriptName, command] of Object.entries(pkg.scripts ?? {})) {
    for (const [, taskName] of command.matchAll(/\bturbo\s+([a-z:-]+)/g)) {
      assert.ok(
        taskNames.has(taskName),
        `${scriptName} references missing turbo task ${taskName}`,
      );
    }
  }
});

// The registry-auth wiring this branch adds is the most novel, most
// cross-cutting thing here, and every piece of it only fails in CI or a
// container build (a committed token 401s installs everywhere; a missing
// registry mapping or exclude 401s/quarantines CI and Docker builds
// specifically) — the exact silent-failure class the rest of this file works
// to close. Guard each piece structurally so a regression is caught locally.
test('registry-auth wiring for @jainparichay/* stays intact', async () => {
  const [npmrc, workspaceYaml, apiDockerfile, webHostDockerfile, compose, ci] =
    await Promise.all([
      readText('.npmrc'),
      readText('pnpm-workspace.yaml'),
      readText('apps/api/Dockerfile'),
      readText('apps/web-host/Dockerfile'),
      readText('docker-compose.yml'),
      readText('.github/workflows/ci.yml'),
    ]);

  // pnpm ignores a token in a committed .npmrc by design; putting one there
  // fails every install with ERR_PNPM_FETCH_401 instead of leaking a secret.
  assert.match(
    npmrc,
    /^@jainparichay:registry=https:\/\/npm\.pkg\.github\.com$/m,
  );
  assert.doesNotMatch(npmrc, /_authToken/);

  assert.match(
    workspaceYaml,
    /minimumReleaseAgeExclude:\s*\n\s*-\s*'@jainparichay\/\*'/,
  );

  for (const dockerfile of [apiDockerfile, webHostDockerfile]) {
    assert.match(dockerfile, /COPY[^\n]*\.npmrc/);
    assert.match(dockerfile, /--mount=type=secret,id=node_auth_token/);
  }

  assert.match(compose, /^secrets:/m);
  assert.match(
    compose,
    /node_auth_token:\s*\n\s*environment:\s*NODE_AUTH_TOKEN/,
  );

  assert.match(ci, /registry-url:\s*https:\/\/npm\.pkg\.github\.com/);
  assert.match(
    ci,
    /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NODE_AUTH_TOKEN\s*\}\}/,
  );
});
