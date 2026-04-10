import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_NAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?|[a-z0-9])$/;

export function validatePackageName(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return {
      valid: false,
      message: 'Package name is required.',
    };
  }

  if (normalized.startsWith('@')) {
    return {
      valid: false,
      message: 'Scoped package names are not supported by this installer.',
    };
  }

  if (!PACKAGE_NAME_PATTERN.test(normalized)) {
    return {
      valid: false,
      message:
        'Use lowercase letters, numbers, dots, dashes, or underscores only.',
    };
  }

  return {
    valid: true,
    message: '',
    normalized,
  };
}

export async function customizeRootPackageName({ repoDir, packageName }) {
  const validation = validatePackageName(packageName);

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const packageJsonPath = path.join(repoDir, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  packageJson.name = validation.normalized;

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
}
