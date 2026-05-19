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

test('removeInstallerArtifacts deletes only installer files before commit', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'starter-cleanup-'));

  try {
    await mkdir(path.join(tempDir, 'scripts', 'lib'), { recursive: true });
    await writeFile(path.join(tempDir, 'package.json'), '{}\n');
    await writeFile(path.join(tempDir, 'README.md'), '# demo\n');
    await writeFile(path.join(tempDir, 'scripts', 'keep.mjs'), 'export {};\n');
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
    await assert.rejects(access(path.join(tempDir, 'scripts', 'bootstrap.sh')));
    await assert.rejects(
      access(path.join(tempDir, 'scripts', 'setup-starter.mjs')),
    );
    await assert.rejects(
      access(
        path.join(tempDir, 'scripts', 'lib', 'customize-root-package.mjs'),
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
