# Deployment

This template builds **products**, so it ships the deployment _mechanism_ and
contract, not a commitment to any one host. Each product fills in the host.

## Model: one combined web host, separable API

The default deployment is one application image and one public listener:

- `apps/web-host` owns the Fastify listener. NestJS/tRPC routes (currently
  `/trpc/*`) are registered first.
- The primary Astro application is built with `@astrojs/node` in middleware
  mode. Its SSR routes, response headers, redirects, cookies, and streaming are
  passed directly through the Node request/response objects.
- Secondary Astro applications remain prerendered and are served under
  `/<dir-name>` with the existing traversal and symlink protections.
- Browser API requests default to same-origin `/trpc`; set `PUBLIC_API_URL` at
  build time only for an explicit split-host deployment.

The API bootstrap remains reusable and `pnpm --filter @workspace-starter/api
start` still opens the standalone API listener. `apps/api/Dockerfile` is kept
for a future split deployment.

The combined image applies committed database migrations before every process
start. Its entrypoint runs `prisma migrate deploy` and starts the web host only
after migration succeeds. A migration failure exits the container without
opening the listener (fail closed). Nest shutdown hooks close Prisma resources.
The standalone API image retains the same migration-first behavior.

```
client ─► web-host image ─┬─ /trpc/* ─► NestJS/tRPC
                          ├─ /secondary-web/* ─► static host
                          └─ all other routes ─► Astro middleware
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

## Registry authentication for container builds

`@jainparichay/*` packages are fetched from GitHub Packages during the image
build, which requires a token even though the packages are public. Both
`apps/api/Dockerfile` and `apps/web-host/Dockerfile`:

- expect a `node_auth_token` BuildKit secret (`--secret id=node_auth_token`,
  or the `secrets:` block already wired in `docker-compose.yml` reading the
  `NODE_AUTH_TOKEN` environment variable),
- write it to `/root/.npmrc` only for the duration of the `pnpm fetch` /
  `pnpm deploy` layers that need it, then remove it in the same layer so the
  token never persists in an image layer, and
- fail fast with an explicit error if the secret is empty, rather than a
  45-second-later unattributed 401.

Build with `docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN ...`
or `NODE_AUTH_TOKEN=<token> docker compose build`. The committed `.npmrc`
supplies only the `@jainparichay:registry` mapping; it never carries the
token itself.

## Regenerating the Prisma Client after `pnpm deploy`

`pnpm deploy --legacy` re-links `@jainparichay/db` from the content-addressable
store into the deployed tree, which discards whatever Prisma Client was
generated during the earlier build step (the generator has no custom
`output`, so there is nothing else to preserve). Both Dockerfiles therefore
run an explicit regenerate step against the deployed package directly:

```bash
cd -P /app/node_modules/@jainparichay/db \
 && DATABASE_URL="postgresql://placeholder" PATH="$PWD/node_modules/.bin:$PATH" prisma generate
```

`@jainparichay/db`'s `prisma.config.ts` throws if `DATABASE_URL` is unset —
even for `generate`, which never connects to a database — so a placeholder
value is supplied. If you change the deploy step or add a new deployable app
that depends on `@jainparichay/db`, keep this regenerate step (or an
equivalent) after its `pnpm deploy`.

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

`pnpm start` builds everything, stages the frontends, and runs the combined
web-host on one listener. Compose runs the same topology with PostgreSQL.
