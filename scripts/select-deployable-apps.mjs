#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function selectDeployableApps(availableApps, requestedApps) {
  const available = [...new Set(availableApps)].sort();

  if (requestedApps === 'all') {
    return available;
  }

  const requested = [
    ...new Set(
      requestedApps
        .split(',')
        .map((app) => app.trim())
        .filter(Boolean),
    ),
  ].sort();

  if (requested.length === 0) {
    throw new Error('Select at least one deployable app, or use "all".');
  }

  const availableSet = new Set(available);
  const invalid = requested.filter((app) => !availableSet.has(app));
  if (invalid.length > 0) {
    throw new Error(
      `Unknown or non-deployable app(s): ${invalid.join(', ')}\nAvailable apps: ${available.join(', ')}`,
    );
  }

  return requested;
}

async function discoverDeployableApps(repoDir) {
  const appsDir = path.join(repoDir, 'apps');
  const entries = await readdir(appsDir, { withFileTypes: true });
  const deployable = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const files = await readdir(path.join(appsDir, entry.name));
    if (files.includes('Dockerfile')) {
      deployable.push(entry.name);
    }
  }

  return deployable;
}

async function main() {
  const requestedApps = process.env.REQUESTED_APPS ?? '';
  const availableApps = await discoverDeployableApps(process.cwd());
  const selectedApps = selectDeployableApps(availableApps, requestedApps);
  process.stdout.write(`${JSON.stringify(selectedApps)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
