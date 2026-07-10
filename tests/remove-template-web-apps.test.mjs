import test from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const REPO_DIR = process.cwd();
const STOCK_DOCKER_COMPOSE_PATH = path.join(REPO_DIR, 'docker-compose.yml');

const KNOWN_START_SCRIPT =
  'pnpm build && node scripts/build-frontends.mjs && pnpm -r --parallel --filter @workspace-starter/web-host --filter @workspace-starter/api start';

async function loadWebAppRemovalHelpers() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/template/remove-web-apps.mjs'),
  );
  return import(moduleUrl.href);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'starter-web-removal-'));

  await writeJson(path.join(tempDir, 'package.json'), {
    name: 'my-project',
    private: true,
    scripts: {
      dev: 'turbo dev',
      start: KNOWN_START_SCRIPT,
      'build:frontends': 'node scripts/build-frontends.mjs',
      'deploy:run': 'node scripts/deploy/run.mjs',
      test: 'node --test tests/root-start-scripts.test.mjs tests/setup-starter.test.mjs tests/remove-template-web-apps.test.mjs tests/repository-guardrails.test.mjs && turbo test',
      'template:remove-web-apps': 'node scripts/template/remove-web-apps.mjs',
    },
  });

  await mkdir(path.join(tempDir, 'tests'), { recursive: true });
  await writeFile(
    path.join(tempDir, 'tests', 'root-start-scripts.test.mjs'),
    "import test from 'node:test';\n",
  );

  await mkdir(path.join(tempDir, 'scripts'), { recursive: true });
  await writeFile(
    path.join(tempDir, 'scripts', 'build-frontends.mjs'),
    'export {};\n',
  );

  for (const appName of ['api', 'web', 'secondary-web', 'web-host']) {
    await mkdir(path.join(tempDir, 'apps', appName), { recursive: true });
    await writeJson(path.join(tempDir, 'apps', appName, 'package.json'), {
      name: `@workspace-starter/${appName}`,
    });
  }

  await copyFile(
    STOCK_DOCKER_COMPOSE_PATH,
    path.join(tempDir, 'docker-compose.yml'),
  );

  return tempDir;
}

test('removeTemplateWebApps removes bundled web apps and rewrites root scripts', async () => {
  const tempDir = await createFixture();

  try {
    const { removeTemplateWebApps } = await loadWebAppRemovalHelpers();

    const stockDockerCompose = await readFile(
      path.join(tempDir, 'docker-compose.yml'),
      'utf8',
    );
    const webHostStart = stockDockerCompose.indexOf('  web-host:\n');
    const apiBoundary = stockDockerCompose.indexOf('\n  api:\n', webHostStart);
    assert.notEqual(webHostStart, -1);
    assert.notEqual(apiBoundary, -1);
    const apiStart = apiBoundary + 1;

    const result = await removeTemplateWebApps({ repoDir: tempDir });

    assert.deepEqual(result.removedDirectories, [
      'apps/web',
      'apps/secondary-web',
      'apps/web-host',
    ]);
    await access(path.join(tempDir, 'apps', 'api', 'package.json'));
    await assert.rejects(access(path.join(tempDir, 'apps', 'web')));
    await assert.rejects(access(path.join(tempDir, 'apps', 'secondary-web')));
    await assert.rejects(access(path.join(tempDir, 'apps', 'web-host')));

    const rootPackage = JSON.parse(
      await readFile(path.join(tempDir, 'package.json'), 'utf8'),
    );
    assert.equal(
      rootPackage.scripts.start,
      'pnpm build && pnpm --filter @workspace-starter/api start',
    );
    assert.equal(rootPackage.scripts['build:frontends'], undefined);
    assert.equal(
      rootPackage.scripts['deploy:run'],
      'node scripts/deploy/run.mjs',
    );
    assert.equal(rootPackage.scripts.dev, 'turbo dev');
    assert.equal(
      rootPackage.scripts['template:remove-web-apps'],
      'node scripts/template/remove-web-apps.mjs',
    );

    await assert.rejects(
      access(path.join(tempDir, 'scripts', 'build-frontends.mjs')),
    );
    await assert.rejects(
      access(path.join(tempDir, 'tests', 'root-start-scripts.test.mjs')),
    );
    assert.doesNotMatch(
      rootPackage.scripts.test,
      /tests\/root-start-scripts\.test\.mjs/,
    );
    assert.match(rootPackage.scripts.test, /tests\/setup-starter\.test\.mjs/);
    assert.match(
      rootPackage.scripts.test,
      /tests\/remove-template-web-apps\.test\.mjs/,
    );
    assert.match(
      rootPackage.scripts.test,
      /tests\/repository-guardrails\.test\.mjs/,
    );
    assert.match(rootPackage.scripts.test, /turbo test/);

    assert.equal(
      await readFile(path.join(tempDir, 'docker-compose.yml'), 'utf8'),
      `${stockDockerCompose.slice(0, webHostStart)}${stockDockerCompose.slice(apiStart)}`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('removeTemplateWebApps dry run leaves files unchanged', async () => {
  const tempDir = await createFixture();

  try {
    const { removeTemplateWebApps } = await loadWebAppRemovalHelpers();

    const result = await removeTemplateWebApps({
      repoDir: tempDir,
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.deepEqual(result.removedDirectories, [
      'apps/web',
      'apps/secondary-web',
      'apps/web-host',
    ]);
    await access(path.join(tempDir, 'apps', 'web', 'package.json'));

    const rootPackage = JSON.parse(
      await readFile(path.join(tempDir, 'package.json'), 'utf8'),
    );
    assert.match(rootPackage.scripts.start, /@workspace-starter\/web-host/);
    assert.equal(
      rootPackage.scripts['build:frontends'],
      'node scripts/build-frontends.mjs',
    );
    assert.match(
      rootPackage.scripts.test,
      /tests\/root-start-scripts\.test\.mjs/,
    );
    await access(path.join(tempDir, 'scripts', 'build-frontends.mjs'));
    await access(path.join(tempDir, 'tests', 'root-start-scripts.test.mjs'));
    assert.match(
      await readFile(path.join(tempDir, 'docker-compose.yml'), 'utf8'),
      /apps\/web-host\/Dockerfile/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('removeTemplateWebApps dry run succeeds on the real repository without mutation', async () => {
  const { removeTemplateWebApps } = await loadWebAppRemovalHelpers();
  const packagePath = path.join(REPO_DIR, 'package.json');
  const before = {
    packageJson: await readFile(packagePath, 'utf8'),
    dockerCompose: await readFile(STOCK_DOCKER_COMPOSE_PATH, 'utf8'),
    buildFrontends: await readFile(
      path.join(REPO_DIR, 'scripts', 'build-frontends.mjs'),
      'utf8',
    ),
    rootStartTest: await readFile(
      path.join(REPO_DIR, 'tests', 'root-start-scripts.test.mjs'),
      'utf8',
    ),
  };

  const result = await removeTemplateWebApps({
    repoDir: REPO_DIR,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(
    result.fileChanges.find(
      ({ relativePath }) => relativePath === 'docker-compose.yml',
    ),
    { relativePath: 'docker-compose.yml', action: 'replace' },
  );
  assert.equal(await readFile(packagePath, 'utf8'), before.packageJson);
  assert.equal(
    await readFile(STOCK_DOCKER_COMPOSE_PATH, 'utf8'),
    before.dockerCompose,
  );
  assert.equal(
    await readFile(
      path.join(REPO_DIR, 'scripts', 'build-frontends.mjs'),
      'utf8',
    ),
    before.buildFrontends,
  );
  assert.equal(
    await readFile(
      path.join(REPO_DIR, 'tests', 'root-start-scripts.test.mjs'),
      'utf8',
    ),
    before.rootStartTest,
  );
  await access(path.join(REPO_DIR, 'apps', 'web'));
  await access(path.join(REPO_DIR, 'apps', 'secondary-web'));
  await access(path.join(REPO_DIR, 'apps', 'web-host'));
});

test('removeTemplateWebApps refuses custom root scripts that reference removed web apps', async () => {
  const tempDir = await createFixture();

  try {
    const rootPackagePath = path.join(tempDir, 'package.json');
    const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
    rootPackage.scripts.start =
      'pnpm build && pnpm --filter @workspace-starter/web start';
    await writeJson(rootPackagePath, rootPackage);

    const { removeTemplateWebApps } = await loadWebAppRemovalHelpers();

    await assert.rejects(
      () => removeTemplateWebApps({ repoDir: tempDir }),
      /Refusing to remove web apps/,
    );
    await access(path.join(tempDir, 'apps', 'web', 'package.json'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('removeTemplateWebApps refuses custom Docker compose files that reference removed web apps', async () => {
  const tempDir = await createFixture();

  try {
    const composePath = path.join(tempDir, 'docker-compose.yml');
    const stockCompose = await readFile(composePath, 'utf8');
    await writeFile(
      composePath,
      `${stockCompose}\nx-custom-web-host-ref: apps/web-host/Dockerfile\n`,
    );

    const { removeTemplateWebApps } = await loadWebAppRemovalHelpers();
    const packagePath = path.join(tempDir, 'package.json');
    const packageBefore = await readFile(packagePath, 'utf8');
    const composeBefore = await readFile(composePath, 'utf8');

    await assert.rejects(
      () => removeTemplateWebApps({ repoDir: tempDir }),
      /Refusing to remove web apps/,
    );
    assert.equal(await readFile(packagePath, 'utf8'), packageBefore);
    assert.equal(await readFile(composePath, 'utf8'), composeBefore);
    await access(path.join(tempDir, 'apps', 'web', 'package.json'));
    await access(path.join(tempDir, 'apps', 'web-host', 'package.json'));
    await access(path.join(tempDir, 'scripts', 'build-frontends.mjs'));
    await access(path.join(tempDir, 'tests', 'root-start-scripts.test.mjs'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
