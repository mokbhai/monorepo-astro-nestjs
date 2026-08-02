import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

async function loadSetupHelpers() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/lib/customize-root-package.mjs'),
  );
  return import(moduleUrl.href);
}

async function loadCleanupHelpers() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/lib/remove-installer-artifacts.mjs'),
  );
  return import(moduleUrl.href);
}

async function loadDeployAdapterHelpers() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/lib/scaffold-deploy-adapter.mjs'),
  );
  return import(moduleUrl.href);
}

async function loadRegistryAuthHelpers() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/lib/check-registry-auth.mjs'),
  );
  return import(moduleUrl.href);
}

test('customizeRootPackageName updates only the root package name', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'starter-setup-'));

  try {
    await writeFile(
      path.join(tempDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'pnpm-turbo-workspace-starter',
          private: true,
        },
        null,
        2,
      )}\n`,
    );

    const { customizeRootPackageName } = await loadSetupHelpers();

    await customizeRootPackageName({
      repoDir: tempDir,
      packageName: 'my-starter',
    });

    const updated = JSON.parse(
      await readFile(path.join(tempDir, 'package.json'), 'utf8'),
    );

    assert.equal(updated.name, 'my-starter');
    assert.equal(updated.private, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('validatePackageName rejects invalid npm package names', async () => {
  const { validatePackageName } = await loadSetupHelpers();

  assert.equal(validatePackageName('valid-name').valid, true);
  assert.equal(validatePackageName('Invalid Name').valid, false);
  assert.equal(validatePackageName('@bad/scope').valid, false);
});

test('scaffoldDeployAdapter writes a stub adapter for a valid target', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'starter-adapter-'));

  try {
    const { scaffoldDeployAdapter, validateDeployTarget } =
      await loadDeployAdapterHelpers();

    assert.equal(validateDeployTarget('cloud-run').valid, true);
    assert.equal(validateDeployTarget('Bad Target').valid, false);

    const result = await scaffoldDeployAdapter({
      repoDir: tempDir,
      target: 'cloud-run',
    });

    assert.equal(result.created, true);
    assert.equal(result.relativePath, 'scripts/deploy/adapters/cloud-run.mjs');

    const adapter = await readFile(
      path.join(tempDir, 'scripts', 'deploy', 'adapters', 'cloud-run.mjs'),
      'utf8',
    );
    assert.match(adapter, /export default async function deploy/);

    const second = await scaffoldDeployAdapter({
      repoDir: tempDir,
      target: 'cloud-run',
    });
    assert.equal(second.created, false, 'existing adapter is not overwritten');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('isRegistryAuthConfigured treats empty and "undefined" as not configured', async () => {
  const { isRegistryAuthConfigured } = await loadRegistryAuthHelpers();

  assert.equal(isRegistryAuthConfigured(''), false);
  assert.equal(isRegistryAuthConfigured('\n'), false);
  assert.equal(isRegistryAuthConfigured('undefined'), false);
  assert.equal(isRegistryAuthConfigured('undefined\n'), false);
  assert.equal(isRegistryAuthConfigured('ghp_examplenotarealtoken\n'), true);
});

test('ensureRegistryAuthConfigured resolves when a token is configured', async () => {
  const { ensureRegistryAuthConfigured } = await loadRegistryAuthHelpers();

  await ensureRegistryAuthConfigured({
    runCapture: async () => ({ stdout: 'ghp_examplenotarealtoken\n' }),
  });
});

test('ensureRegistryAuthConfigured fails fast with a README-pointing message when no token is configured', async () => {
  const { ensureRegistryAuthConfigured } = await loadRegistryAuthHelpers();

  await assert.rejects(
    ensureRegistryAuthConfigured({
      runCapture: async () => ({ stdout: 'undefined\n' }),
    }),
    /pnpm config set .*_authToken.*README\.md.*Authenticate to GitHub Packages/s,
  );
});

test('removeInstallerArtifacts deletes only installer files before commit', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'starter-cleanup-'));

  const testScriptCommand =
    'node --test tests/root-start-scripts.test.mjs tests/setup-starter.test.mjs tests/remove-template-web-apps.test.mjs tests/repository-guardrails.test.mjs && turbo test';

  try {
    await mkdir(path.join(tempDir, 'scripts', 'lib'), { recursive: true });
    await mkdir(path.join(tempDir, 'scripts', 'template'), {
      recursive: true,
    });
    await mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'demo',
          private: true,
          scripts: { test: testScriptCommand },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(path.join(tempDir, 'README.md'), '# demo\n');
    await writeFile(
      path.join(tempDir, 'tests', 'setup-starter.test.mjs'),
      'export {};\n',
    );
    await writeFile(path.join(tempDir, 'scripts', 'keep.mjs'), 'export {};\n');
    await writeFile(
      path.join(tempDir, 'scripts', 'template', 'remove-web-apps.mjs'),
      'export {};\n',
    );
    await writeFile(
      path.join(tempDir, 'scripts', 'bootstrap.sh'),
      '#!/usr/bin/env bash\n',
    );
    await writeFile(
      path.join(tempDir, 'scripts', 'setup-starter.mjs'),
      'export {};\n',
    );
    await writeFile(
      path.join(tempDir, 'scripts', 'lib', 'customize-root-package.mjs'),
      'export {};\n',
    );

    const { removeInstallerArtifacts } = await loadCleanupHelpers();
    await removeInstallerArtifacts({ repoDir: tempDir });

    const { access } = await import('node:fs/promises');

    await access(path.join(tempDir, 'scripts', 'keep.mjs'));
    await access(
      path.join(tempDir, 'scripts', 'template', 'remove-web-apps.mjs'),
    );
    await assert.rejects(access(path.join(tempDir, 'scripts', 'bootstrap.sh')));
    await assert.rejects(
      access(path.join(tempDir, 'scripts', 'setup-starter.mjs')),
    );
    await assert.rejects(
      access(
        path.join(tempDir, 'scripts', 'lib', 'customize-root-package.mjs'),
      ),
    );
    await assert.rejects(
      access(path.join(tempDir, 'tests', 'setup-starter.test.mjs')),
    );

    const updatedPackage = JSON.parse(
      await readFile(path.join(tempDir, 'package.json'), 'utf8'),
    );
    assert.ok(
      !updatedPackage.scripts.test.includes('tests/setup-starter.test.mjs'),
    );
    assert.ok(
      updatedPackage.scripts.test.includes('tests/root-start-scripts.test.mjs'),
    );
    assert.ok(
      updatedPackage.scripts.test.includes(
        'tests/remove-template-web-apps.test.mjs',
      ),
    );
    assert.ok(
      updatedPackage.scripts.test.includes(
        'tests/repository-guardrails.test.mjs',
      ),
    );
    assert.ok(updatedPackage.scripts.test.includes('turbo test'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
