import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const INSTALLER_ARTIFACTS = [
  ['scripts', 'bootstrap.sh'],
  ['scripts', 'setup-starter.mjs'],
  ['scripts', 'lib'],
];

async function removeIfPresent(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

async function removeDirectoryIfEmpty(targetPath) {
  const entries = await readdir(targetPath).catch(() => null);
  if (entries && entries.length === 0) {
    await rm(targetPath, { recursive: true, force: true });
  }
}

export async function removeInstallerArtifacts({ repoDir }) {
  for (const segments of INSTALLER_ARTIFACTS) {
    await removeIfPresent(path.join(repoDir, ...segments));
  }

  await removeDirectoryIfEmpty(path.join(repoDir, 'scripts'));
}
