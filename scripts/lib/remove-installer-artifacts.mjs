import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const INSTALLER_ARTIFACTS = [
  ['scripts', 'bootstrap.sh'],
  ['scripts', 'setup-starter.mjs'],
  ['scripts', 'lib'],
  ['tests', 'setup-starter.test.mjs'],
];

const OBSOLETE_TEST_FILE = 'tests/setup-starter.test.mjs';

async function removeIfPresent(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

async function removeDirectoryIfEmpty(targetPath) {
  const entries = await readdir(targetPath).catch(() => null);
  if (entries && entries.length === 0) {
    await rm(targetPath, { recursive: true, force: true });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeObsoleteTestArgument(command) {
  if (!command.includes(OBSOLETE_TEST_FILE)) {
    return command;
  }

  return command
    .replace(new RegExp(`\\s+${escapeRegExp(OBSOLETE_TEST_FILE)}`, 'g'), '')
    .replace(new RegExp(`${escapeRegExp(OBSOLETE_TEST_FILE)}\\s+`, 'g'), '')
    .replace(OBSOLETE_TEST_FILE, '');
}

async function updateRootPackageTestScript(packageJsonPath) {
  let raw;
  try {
    raw = await readFile(packageJsonPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const pkg = JSON.parse(raw);
  const testCommand = pkg.scripts?.test;

  if (
    typeof testCommand !== 'string' ||
    !testCommand.includes(OBSOLETE_TEST_FILE)
  ) {
    return;
  }

  pkg.scripts.test = removeObsoleteTestArgument(testCommand);

  await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

export async function removeInstallerArtifacts({ repoDir }) {
  for (const segments of INSTALLER_ARTIFACTS) {
    await removeIfPresent(path.join(repoDir, ...segments));
  }

  await updateRootPackageTestScript(path.join(repoDir, 'package.json'));

  await removeDirectoryIfEmpty(path.join(repoDir, 'scripts'));
}
