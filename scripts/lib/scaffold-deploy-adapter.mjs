import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TARGET_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateDeployTarget(target) {
  if (!TARGET_PATTERN.test(target)) {
    return {
      valid: false,
      message:
        'Deploy target must be lowercase letters, numbers, and dashes (e.g. "cloud-run").',
    };
  }
  return { valid: true };
}

function adapterTemplate(target) {
  return `// Deploy adapter for DEPLOY_TARGET="${target}".
//
// The dispatcher (scripts/deploy/run.mjs) calls this with the deploy context
// documented in docs/guides/deployment.md:
//   { target, images, apps, sha, registry, env }
//
// Replace the body with the commands that roll your images out to your host.

export default async function deploy(context) {
  const { images, sha } = context;

  // TODO: implement deployment for "${target}".
  // Example shapes:
  //   - VPS:        ssh host 'cd /srv/app && docker compose pull && docker compose up -d'
  //   - Cloud Run:  gcloud run deploy <svc> --image <ref>
  //   - Kubernetes: kubectl set image deploy/<svc> <svc>=<ref>

  console.log(\`Deploying \${Object.keys(images).length} image(s) at \${sha}.\`);
  throw new Error('Deploy adapter "${target}" is not implemented yet.');
}
`;
}

// Writes scripts/deploy/adapters/<target>.mjs unless it already exists. The
// adapter lives outside the installer-only scripts/lib directory, so it
// survives setup into the generated product.
export async function scaffoldDeployAdapter({ repoDir, target }) {
  const validation = validateDeployTarget(target);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const adaptersDir = path.join(repoDir, 'scripts', 'deploy', 'adapters');
  const relativePath = path.posix.join(
    'scripts',
    'deploy',
    'adapters',
    `${target}.mjs`,
  );
  const adapterPath = path.join(adaptersDir, `${target}.mjs`);

  try {
    await access(adapterPath);
    return { created: false, relativePath };
  } catch {
    // does not exist yet — create it
  }

  await mkdir(adaptersDir, { recursive: true });
  await writeFile(adapterPath, adapterTemplate(target), 'utf8');
  return { created: true, relativePath };
}
