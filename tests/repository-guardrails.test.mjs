import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  assert.match(entrypoint, /node_modules\/@jainparichay\/db/);
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
  assert.match(entrypoint, /cd -P \/app\/node_modules\/@jainparichay\/db/);
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

// This test intentionally excludes `node_modules` from the isolated copy so
// the copy step stays fast and deterministic (the real workspace
// `node_modules` is large and irrelevant to what `pnpm deploy` produces from
// the lockfile/store). One consequence: `apps/api/node_modules` does not
// exist yet when `pnpm deploy`'s source-workspace pass runs the `postinstall`
// hook, so `scripts/prisma.mjs generate` legitimately no-ops there (see its
// own "pnpm deploy source pass" comment) rather than actually generating a
// Prisma Client. This test therefore verifies deploy-path *structure* —
// `@jainparichay/db`'s static Prisma artifacts (config, schema, migrations)
// land in the deployed tree and its bundled `prisma` CLI is runnable from
// there — but it does NOT exercise or guard `prisma generate` /
// `@prisma/client` generation. That path is covered by the Dockerfiles
// (`apps/api/Dockerfile`, `apps/web-host/Dockerfile`), which regenerate the
// client after `pnpm deploy` against a fully installed tree.
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

    const dbDir = path.join(deployDir, 'node_modules', '@jainparichay', 'db');
    await Promise.all([
      stat(path.join(dbDir, 'prisma.config.ts')),
      stat(path.join(dbDir, 'prisma', 'schema.prisma')),
      stat(
        path.join(
          dbDir,
          'prisma',
          'migrations',
          '20250629120000_init',
          'migration.sql',
        ),
      ),
    ]);

    // `@jainparichay/db`'s `prisma.config.ts` throws if `DATABASE_URL` is
    // unset, even for `--version` (it loads config eagerly). `--version`
    // never connects to a database, so a placeholder is sufficient.
    const { stdout } = await execFileAsync(
      '/bin/sh',
      [
        '-c',
        'cd -P "$1" && PATH="$PWD/node_modules/.bin:$PATH" prisma --version',
        'sh',
        dbDir,
      ],
      {
        cwd: isolatedRepoDir,
        env: { ...process.env, DATABASE_URL: 'postgresql://placeholder' },
      },
    );
    assert.match(stdout, /prisma\s+: 7\./);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
// ways: Astro apps are staged into it as static/SSR output, and other apps it
// embeds as a `workspace:*` dependency (currently just `@workspace-starter/api`,
// per #20's combined Astro/NestJS host) run inside its own process. Either
// way, web-host must carry every non-workspace runtime dependency those apps
// need as a top-level dependency of its own — the invariant is not specific
// to the `@jainparichay/*` namespace: `apps/web`'s built server already
// externalizes third-party packages (e.g. `react`, `react-dom/server`,
// `react/jsx-runtime`) exactly the same way it externalizes `@jainparichay/*`
// ones, and the next dependency added to any served app (a new
// `@tanstack/*`/`@trpc/*` package, say) would reproduce the same silent gap
// under an unguarded namespace. `workspace:*` specifiers are the only
// exemption: those resolve through the monorepo's own workspace linking, not
// through a version web-host needs to mirror. Nothing enforces this mirror
// structurally, so this test derives all three sets — the apps web-host
// serves, their non-workspace dependencies, and web-host's own dependencies —
// from the manifests instead of hardcoding any of them.
// Commit 81417a8 (apps/api's `@workspace-starter/db` gap) and the Task 11
// web-host 500 (apps/web's `@jainparichay/{i18n,storage,types,ui}` gap) both
// shipped with `pnpm build`/`typecheck`/`test`/CI green and only failed at
// container runtime because this mirror silently drifted — one incident from
// each of the two ways an app ends up served by web-host, both covered here.
test('web-host mirrors every non-workspace runtime dependency of the apps it serves', async () => {
  const appNames = (
    await readdir(new URL('apps/', rootDir), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((appName) => appName !== 'web-host');

  const appManifestsByDirectory = new Map(
    await Promise.all(
      appNames.map(async (appName) => [
        appName,
        await readJson(`apps/${appName}/package.json`),
      ]),
    ),
  );

  const webHostManifest = await readJson('apps/web-host/package.json');
  const webHostDependencies = webHostManifest.dependencies ?? {};

  for (const appName of appNames) {
    const manifest = appManifestsByDirectory.get(appName);
    const isEmbeddedInWebHost =
      webHostDependencies[manifest.name] === 'workspace:*';
    const servesAstroOutput = await isAstroApp(appName);

    if (!isEmbeddedInWebHost && !servesAstroOutput) {
      continue;
    }

    const dependencies = manifest.dependencies ?? {};

    for (const [dependencyName, version] of Object.entries(dependencies)) {
      if (version === 'workspace:*') {
        continue;
      }

      assert.equal(
        webHostDependencies[dependencyName],
        version,
        `apps/web-host must declare ${dependencyName}@${version} in dependencies ` +
          `(apps/${appName} depends on it and web-host serves it at runtime)`,
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

// scripts/prisma.mjs is COPY'd alone into apps/api's build layer (see
// apps/api/Dockerfile), before the rest of the repo is present — a relative
// import would resolve against a directory that doesn't exist in that image
// and break the build with no other coverage of this constraint.
test('scripts/prisma.mjs has no relative import', async () => {
  const source = await readText('scripts/prisma.mjs');
  assert.doesNotMatch(source, /^import .* from '\.\//m);
});
