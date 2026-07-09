import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

async function loadDiscover() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/capacitor/discover.mjs'),
  );
  return import(moduleUrl.href);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture(apps) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'capacitor-discover-'));
  for (const [name, { astro = false, capacitor = false } = {}] of apps) {
    const appDir = path.join(tempDir, 'apps', name);
    await mkdir(appDir, { recursive: true });
    await writeJson(path.join(appDir, 'package.json'), {
      name: `@workspace-starter/${name}`,
    });
    if (astro) {
      await writeFile(
        path.join(appDir, 'astro.config.ts'),
        'export default {};\n',
      );
    }
    if (capacitor) {
      await writeFile(
        path.join(appDir, 'capacitor.config.ts'),
        'export default {};\n',
      );
    }
  }
  return tempDir;
}

test('discoverCapacitorApps finds Astro apps with capacitor.config.ts', async () => {
  const tempDir = await createFixture([
    ['web', { astro: true, capacitor: true }],
    ['secondary-web', { astro: true, capacitor: true }],
    ['api', { astro: false, capacitor: false }],
    ['web-host', { astro: false, capacitor: false }],
  ]);

  try {
    const { discoverCapacitorApps } = await loadDiscover();
    const apps = await discoverCapacitorApps({ repoDir: tempDir });

    assert.deepEqual(
      apps.map((app) => app.name),
      ['secondary-web', 'web'],
    );
    assert.equal(apps[1].packageName, '@workspace-starter/web');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('discoverCapacitorApps returns empty when no capacitor configs exist', async () => {
  const tempDir = await createFixture([
    ['web', { astro: true, capacitor: false }],
  ]);

  try {
    const { discoverCapacitorApps } = await loadDiscover();
    const apps = await discoverCapacitorApps({ repoDir: tempDir });
    assert.deepEqual(apps, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
