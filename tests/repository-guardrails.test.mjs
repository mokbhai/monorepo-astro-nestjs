import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectDeployableApps } from '../scripts/select-deployable-apps.mjs';

const rootDir = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function listPackageJsonFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, rootDir), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}/package.json`);
}

test('root exposes repository guardrail scripts with pinned tooling', async () => {
  const pkg = await readJson('package.json');

  assert.equal(pkg.packageManager, 'pnpm@11.1.3');
  assert.equal(pkg.engines?.node, '>=22.13.0');
  assert.equal(pkg.engines?.pnpm, '>=11.1.3 <12');
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
    'npm install --global corepack@0.34.2',
  );
  const pnpmPrepareIndex = workflow.indexOf(
    'corepack prepare pnpm@11.1.3 --activate',
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
  assert.match(workflow, /node scripts\/select-deployable-apps\.mjs/);
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

test('deployable app selection handles all, subsets, whitespace, and duplicates', () => {
  const available = ['web-host', 'api'];

  assert.deepEqual(selectDeployableApps(available, 'all'), ['api', 'web-host']);
  assert.deepEqual(selectDeployableApps(available, ' web-host, api,api '), [
    'api',
    'web-host',
  ]);
});

test('deployable app selection rejects empty and unknown selections clearly', () => {
  const available = ['api', 'web-host'];

  assert.throws(
    () => selectDeployableApps(available, ' ,  '),
    /Select at least one deployable app, or use "all"\./,
  );
  assert.throws(
    () => selectDeployableApps(available, 'api,nope'),
    /Unknown or non-deployable app\(s\): nope\nAvailable apps: api, web-host/,
  );
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
  assert.match(entrypoint, /cd -P \/app\/node_modules\/@workspace-starter\/db/);
  assert.notEqual(migrateIndex, -1);
  assert.notEqual(apiIndex, -1);
  assert.ok(migrateIndex < apiIndex, 'migrations must run before API startup');
  assert.doesNotMatch(
    entrypoint,
    /\|\||;/,
    'migration failure must stop startup',
  );
});

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

    const dbDir = path.join(
      deployDir,
      'node_modules',
      '@workspace-starter',
      'db',
    );
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

    const { stdout } = await execFileAsync(
      '/bin/sh',
      [
        '-c',
        'cd -P "$1" && PATH="$PWD/node_modules/.bin:$PATH" prisma --version',
        'sh',
        dbDir,
      ],
      { cwd: isolatedRepoDir },
    );
    assert.match(stdout, /prisma\s+: 7\./);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('workspace package manifests keep shared graph invariants', async () => {
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
