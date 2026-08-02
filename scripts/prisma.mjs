#!/usr/bin/env node
// Invokes the Prisma CLI that ships inside the published `@jainparichay/db`
// package, with that package's own directory as cwd (so its `prisma.config.ts`
// is auto-discovered and its `schema`/`migrations.path` fields are honored).
//
// This exists instead of a `cd node_modules/@jainparichay/db && ...` shell
// one-liner for three reasons:
//   1. `@jainparichay/db` is not hoisted to the workspace root today, but a
//      hardcoded relative path breaks the moment hoisting configuration
//      changes (public-hoist-pattern, node-linker=hoisted, etc.). Resolving
//      via Node's own module search paths survives that.
//   2. `prisma generate` invoked with `apps/api` as cwd cannot resolve
//      `@prisma/client` (it isn't reachable from apps/api's own resolution
//      scope), so the working directory must actually be `@jainparichay/db`'s
//      package directory, not merely told about it via `--schema`.
//   3. Everything here is pure Node, so it works on Windows too (no `sh -c`).
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const apiPackageJson = path.join(repoRoot, 'apps', 'api', 'package.json');
const apiNodeModules = path.join(repoRoot, 'apps', 'api', 'node_modules');

// `pnpm db:migrate`/`db:deploy`/`db:studio` are root scripts, so a root `.env`
// (the file Getting Started tells readers to `cp .env.example .env` into) is
// never read automatically — nothing here or in pnpm loads it into
// `process.env`. Load it explicitly by absolute path (not relying on cwd,
// since this script is also invoked from apps/api's postinstall with a
// different cwd) so `DATABASE_URL` is actually available the way the docs
// imply. Already-set environment variables win over the file, matching how
// `process.loadEnvFile` and every other .env loader behaves.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // No root `.env` present — fine for `generate` (falls back to a
  // placeholder below) and surfaced clearly for every other subcommand by
  // the DATABASE_URL check right after this.
}

const args = process.argv.slice(2);
const isGenerate = args[0] === 'generate';

if (!isGenerate && !process.env.DATABASE_URL) {
  console.error(
    'error: DATABASE_URL is not set. Set it (see .env.example) before running ' +
      `"prisma ${args.join(' ')}" — this command touches a real database, so it cannot ` +
      'fall back to a placeholder the way `generate` does.',
  );
  process.exit(1);
}

/**
 * Finds the on-disk directory for `packageName`, searching the same
 * candidate node_modules directories Node's own resolver would (via
 * `require.resolve.paths`), but checking for the package directory directly
 * instead of resolving through its `exports` map. `@jainparichay/db`'s
 * `exports` field intentionally does not expose `./package.json` or a
 * `require`-compatible main entry (it's ESM-only), so a plain
 * `require.resolve('@jainparichay/db/package.json')` throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED even though the package is perfectly
 * resolvable. Walking the search paths ourselves sidesteps that, and it
 * still survives hoisting changes because it checks every ancestor
 * `node_modules`, not one hardcoded relative path.
 */
function resolvePackageDir(fromPackageJson, packageName) {
  const require = createRequire(fromPackageJson);
  const searchDirs = require.resolve.paths(packageName) ?? [];
  for (const dir of searchDirs) {
    const candidate = path.join(dir, ...packageName.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return undefined;
}

function resolveBinScript(packageDir, binName) {
  const pkg = JSON.parse(
    readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  );
  const relative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binName];
  return relative ? path.join(packageDir, relative) : undefined;
}

let dbDir;
let prismaBinPath;
try {
  dbDir = resolvePackageDir(apiPackageJson, '@jainparichay/db');
  if (!dbDir) {
    throw new Error(
      'could not locate @jainparichay/db in any node_modules on the resolution path',
    );
  }

  // Prefer resolving prisma's own package the same way (it's a direct
  // devDependency of apps/api). Only fall back to @jainparichay/db's private
  // `.bin` symlink — a pnpm virtual-store implementation detail, not a
  // public contract — if that fails.
  const prismaDir = resolvePackageDir(apiPackageJson, 'prisma');
  prismaBinPath = prismaDir && resolveBinScript(prismaDir, 'prisma');
  if (!prismaBinPath) {
    const fallback = path.join(dbDir, 'node_modules', '.bin', 'prisma');
    if (existsSync(fallback)) {
      prismaBinPath = fallback;
    } else {
      throw new Error(
        'could not resolve the prisma CLI from apps/api or @jainparichay/db',
      );
    }
  }
} catch (error) {
  // `pnpm deploy`'s legacy implementation runs apps/api's `postinstall`
  // against the *source* workspace before apps/api/node_modules has been
  // linked at all — there is nothing to generate against yet, and the
  // Dockerfiles regenerate the client after `pnpm deploy` completes anyway.
  // Skip narrowly and say so — but only when this really is that automatic
  // postinstall pass (`npm_lifecycle_event === 'postinstall'`). A
  // user-invoked `pnpm db:generate` hitting the same "node_modules not
  // linked yet" condition is not in that situation — the skip message
  // would describe a cause the user isn't experiencing and exit 0 on what
  // is, for them, a real failure. Never fail silently otherwise.
  const isDeployPostinstallPass =
    process.env.npm_lifecycle_event === 'postinstall' &&
    !existsSync(apiNodeModules);

  if (isDeployPostinstallPass) {
    console.warn(
      'warning: skipping prisma generate (node_modules not linked yet — pnpm deploy source pass)',
    );
    process.exit(0);
  }
  console.error(`error: broken install — ${error.message}`);
  process.exit(1);
}

const env = { ...process.env };
if (isGenerate && !env.DATABASE_URL) {
  // `generate` never connects to a database, so a placeholder keeps
  // install/build deterministic without requiring local DB configuration.
  env.DATABASE_URL = 'postgresql://placeholder';
}

const result = spawnSync(process.execPath, [prismaBinPath, ...args], {
  cwd: dbDir,
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
