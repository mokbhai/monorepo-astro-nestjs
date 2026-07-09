#!/usr/bin/env node

// Adds Android and iOS native projects for Capacitor-enabled frontends when
// they are missing. Requires a prior static build (run capacitor:sync first).

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { discoverCapacitorApps } from './discover.mjs';
import { syncCapacitorApp } from './sync.mjs';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

async function ensurePlatform(appDir, platform) {
  const platformDir = path.join(appDir, platform);
  if (await pathExists(platformDir)) {
    console.log(`- ${platform}: already present`);
    return;
  }

  console.log(`- ${platform}: adding native project`);
  await runCommand('pnpm', ['exec', 'cap', 'add', platform], {
    cwd: appDir,
  });
}

export async function initCapacitorPlatforms({
  repoDir = process.cwd(),
  appName = process.env.CAPACITOR_APP,
  platforms = ['android', 'ios'],
} = {}) {
  const allApps = await discoverCapacitorApps({ repoDir });
  if (allApps.length === 0) {
    throw new Error(
      'No Capacitor apps found. Add capacitor.config.ts to an Astro app under apps/.',
    );
  }

  const apps = appName
    ? allApps.filter((app) => app.name === appName)
    : allApps;

  if (appName && apps.length === 0) {
    const available = allApps.map((app) => app.name).join(', ');
    throw new Error(
      `Unknown Capacitor app "${appName}". Available: ${available}`,
    );
  }

  for (const app of apps) {
    console.log(`Initializing platforms for ${app.name}`);
    await syncCapacitorApp({ app, repoDir });
    for (const platform of platforms) {
      await ensurePlatform(app.dir, platform);
    }
    await runCommand('pnpm', ['exec', 'cap', 'sync'], { cwd: app.dir });
  }

  return apps.map(({ name }) => name);
}

async function main() {
  const appName = process.argv[2];
  const platformArg = process.argv[3];
  const platforms = platformArg
    ? platformArg.split(',').map((value) => value.trim())
    : ['android', 'ios'];
  const initialized = await initCapacitorPlatforms({ appName, platforms });
  console.log('Initialized Capacitor platforms for:');
  for (const name of initialized) {
    console.log(`- ${name}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
