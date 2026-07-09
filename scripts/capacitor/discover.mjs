#!/usr/bin/env node

// Discovers every Capacitor-enabled Astro frontend under apps/*.
// An app is mobile-capable iff it has capacitor.config.ts alongside its
// Astro config — mirroring the Dockerfile convention for deployable backends.

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ASTRO_CONFIG_NAMES = [
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
];

const CAPACITOR_CONFIG_NAMES = ['capacitor.config.ts', 'capacitor.config.js'];

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function isAstroApp(appDir) {
  for (const configName of ASTRO_CONFIG_NAMES) {
    if (await pathExists(path.join(appDir, configName))) {
      return true;
    }
  }
  return false;
}

async function hasCapacitorConfig(appDir) {
  for (const configName of CAPACITOR_CONFIG_NAMES) {
    if (await pathExists(path.join(appDir, configName))) {
      return true;
    }
  }
  return false;
}

export async function discoverCapacitorApps({ repoDir } = {}) {
  const resolvedRepoDir = repoDir ?? process.cwd();
  const appsDir = path.join(resolvedRepoDir, 'apps');
  const entries = await readdir(appsDir, { withFileTypes: true });

  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const appDir = path.join(appsDir, entry.name);
    if (!(await isAstroApp(appDir)) || !(await hasCapacitorConfig(appDir))) {
      continue;
    }

    const manifest = await readJson(path.join(appDir, 'package.json'));
    apps.push({
      name: entry.name,
      dir: appDir,
      packageName: manifest.name,
    });
  }

  apps.sort((left, right) => left.name.localeCompare(right.name));
  return apps;
}
