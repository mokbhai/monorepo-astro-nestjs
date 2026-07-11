# Deployment

This template builds **products**, so it ships the deployment _mechanism_ and
contract, not a commitment to any one host. Each product fills in the host.

## Model: frontends aggregate, backends stay independent

Frontends and backends are different problems, so they deploy differently:

- **Frontends are static artifacts.** Every Astro app under `apps/*` is built
  as a static site and bundled into a single deployable, `apps/web-host`. The
  primary frontend (default `web`) is served at `/`, every other frontend at
  `/<dir-name>`. One image, one deploy, one origin — no matter how many
  frontends you have.
- **Backends are stateful services.** Each backend (e.g. `apps/api`) ships its
  own image and deploys independently, with its own runtime and scaling.

A reverse proxy / ingress in front routes hostnames or paths to the web-host
image and to each backend.

The API image applies committed database migrations before every process start.
Its entrypoint runs `prisma migrate deploy` and starts `node dist/main` only
after migration succeeds. A migration failure exits the container without
starting the API (fail closed). Set `DATABASE_URL` for the target database and
ensure only compatible API revisions start concurrently during a rollout.

```
proxy ── /, /admin, … ─► web-host image (all frontends)
     ├── api.*          ─► api image
     └── jobs.*         ─► other backend images
```

## The convention: a Dockerfile makes an app deployable

> **An app produces a published image iff it has `apps/<name>/Dockerfile`.**

- **Add a frontend:** create an Astro app under `apps/<name>` (no Dockerfile).
  `scripts/build-frontends.mjs` discovers it, builds it static, and stages it
  under `apps/web-host/sites/<name>`; web-host mounts it at `/<name>`. No edits
  to web-host or any workflow.
- **Add a backend:** create `apps/<name>` with its own `Dockerfile`. The
  build-and-publish workflow picks it up automatically.
- **Promote a frontend to its own deploy** (own domain / release cadence): give
  it its own `Dockerfile` and it becomes an independently published image like
  a backend. This is the deliberate exception to aggregation.

The primary frontend is selected when the web-host image is built and must also
be its runtime `PRIMARY_FRONTEND` (default `web`). The Dockerfile carries the
selected build argument into the runtime image by default, so its staged Astro
base paths and server mounts stay consistent. A runtime override should only
select the same frontend used for the build. A frontend's Astro `base` must
match its mount path; `build-frontends.mjs` sets `ASTRO_BASE` per app so they
stay in sync.

## Manual container release

`.github/workflows/build-and-publish.yml` never runs after CI or a push. An
operator must start **Build and Publish** from the GitHub Actions UI and provide:

- **ref:** the branch, tag, or SHA to check out and publish;
- **apps:** `all` or a comma-separated subset of deployable app directory names;
- **public_api_url:** the `PUBLIC_API_URL` embedded in web frontend artifacts;
- **primary_frontend:** the Astro app staged and served at `/` by web-host.

The workflow validates selected apps against the `apps/*/Dockerfile`
convention, resolves the selected ref to its exact commit SHA, and builds the
selected images. It passes both frontend settings as Docker build arguments;
web-host uses them while staging its static sites. Images are pushed to GitHub
Container Registry (`ghcr.io/<owner>/<repo>`) with both the resolved git SHA
and `latest` tags.

Publishing does **not** deploy or invoke the deploy dispatcher. Deploy an
explicit SHA-tagged image separately using your host's release process. Existing
GHCR package versions are retained; disabling automatic releases does not
delete package history.

Run CI for the selected ref and confirm it passes before manually publishing.
Because publishing is intentionally operator-triggered, the workflow does not
automatically wait for or infer a CI run.

## Optional deploy dispatcher

`scripts/deploy/run.mjs` remains available for products that choose to invoke
it from their own manual host-release process. The Build and Publish workflow
does not call it. The script is host-agnostic: it reads `DEPLOY_TARGET` and
calls `scripts/deploy/adapters/<target>.mjs`. The target must use lowercase
letters, numbers, and dashes, starting with a letter or number (for example,
`cloud-run`):

```js
export default async function deploy(context) {
  // context = {
  //   target,                       // the DEPLOY_TARGET value
  //   images,   // { 'web-host': 'ghcr.io/owner/repo/web-host:<sha>', api: '…' }
  //   apps,     // ['web-host', 'api']
  //   sha,      // git SHA being deployed
  //   registry, // resolved registry base
  //   env,      // process.env (for secrets/config)
  // }
}
```

With no `DEPLOY_TARGET`, or no matching adapter, the dispatcher is a documented
no-op. Set the deploy contract environment variables and invoke it explicitly;
container publishing alone never runs it.

### Writing an adapter

1. Copy `scripts/deploy/adapters/example-echo.mjs` to
   `scripts/deploy/adapters/<target>.mjs` (or run `setup:starter`, which
   scaffolds a stub for the target you name).
2. Implement `deploy(context)` for your host. Common shapes:
   - **VPS:** `ssh host 'cd /srv/app && docker compose pull && docker compose up -d'`
   - **Cloud Run:** `gcloud run deploy <svc> --image <imageRef>` per image
   - **Kubernetes:** `kubectl set image deploy/<svc> <svc>=<imageRef>` per image
3. Set the `DEPLOY_TARGET` repository variable to `<target>` and add any
   secrets your adapter reads from `context.env`.

## Local production run

`pnpm start` builds everything, stages the frontends, and runs the web-host and
api together — the same topology as production, on one machine.
