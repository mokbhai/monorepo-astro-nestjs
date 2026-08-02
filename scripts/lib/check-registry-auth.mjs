import { captureCommand } from './run-command.mjs';

const REGISTRY_AUTH_CONFIG_KEY = '//npm.pkg.github.com/:_authToken';

// `pnpm config get` prints the literal string "undefined" (not an empty
// string) when the key has never been set, so both cases must be treated as
// "not configured".
export function isRegistryAuthConfigured(rawConfigValue) {
  const value = rawConfigValue.trim();
  return Boolean(value) && value !== 'undefined';
}

export async function ensureRegistryAuthConfigured({
  runCapture = captureCommand,
} = {}) {
  const result = await runCapture(
    'pnpm',
    ['config', 'get', REGISTRY_AUTH_CONFIG_KEY],
    { allowFailure: true },
  );

  if (!isRegistryAuthConfigured(result.stdout)) {
    throw new Error(
      'GitHub Packages authentication is not configured. `pnpm install` ' +
        'needs a token to fetch @jainparichay/* packages, and running it ' +
        'unauthenticated now would leave this repo half-customized. Run ' +
        '`pnpm config set //npm.pkg.github.com/:_authToken <a GitHub token ' +
        'with read:packages>` and try again — see README.md, ' +
        '"1. Authenticate to GitHub Packages".',
    );
  }
}
