#!/usr/bin/env node

// Builds an Astro frontend for Capacitor (static, root base path) and runs
// `cap sync` so native projects pick up the latest web bundle.

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { discoverCapacitorApps } from './discover.mjs';

function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(
          new Error(
            `Command failed: ${command} ${args.join(' ')} (exit ${code})`,
          ),
        );
      }
    });
  });
}

function resolveApps(allApps, requestedName) {
  if (!requestedName) {
    return allApps;
  }

  const match = allApps.find((app) => app.name === requestedName);
  if (!match) {
    const available = allApps.map((app) => app.name).join(', ') || 'none';
    throw new Error(
      `Unknown Capacitor app "${requestedName}". Available: ${available}`,
    );
  }

  return [match];
}

export async function syncCapacitorApp({
  app,
  repoDir = process.cwd(),
  apiUrl = process.env.PUBLIC_API_URL,
} = {}) {
  await runCommand('pnpm', ['turbo', 'build', '--filter', app.packageName], {
    cwd: repoDir,
    env: {
      ASTRO_DEPLOY_TARGET: 'static',
      ASTRO_BASE: '/',
      ...(apiUrl ? { PUBLIC_API_URL: apiUrl } : {}),
    },
  });

  await runCommand('pnpm', ['exec', 'cap', 'sync'], {
    cwd: app.dir,
  });
}

export async function syncCapacitorApps({
  repoDir = process.cwd(),
  appName = process.env.CAPACITOR_APP,
  apiUrl = process.env.PUBLIC_API_URL,
} = {}) {
  const allApps = await discoverCapacitorApps({ repoDir });
  if (allApps.length === 0) {
    throw new Error(
      'No Capacitor apps found. Add capacitor.config.ts to an Astro app under apps/.',
    );
  }

  const apps = resolveApps(allApps, appName);
  for (const app of apps) {
    console.log(`Syncing Capacitor app: ${app.name}`);
    await syncCapacitorApp({ app, repoDir, apiUrl });
  }

  return apps.map(({ name, packageName }) => ({ name, packageName }));
}

async function main() {
  const appName = process.argv[2];
  const synced = await syncCapacitorApps({ appName });
  console.log('Synced Capacitor apps:');
  for (const app of synced) {
    console.log(`- ${app.name} (${app.packageName})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
