import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHostServer, type MountedSite } from './static-host.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '4321', 10);

const primaryWebDist =
  process.env.PRIMARY_WEB_DIST ??
  path.resolve(moduleDir, '../../web/dist/client');
const secondaryWebDist =
  process.env.SECONDARY_WEB_DIST ??
  path.resolve(moduleDir, '../../secondary-web/dist');
const secondaryBasePath = process.env.SECONDARY_BASE_PATH ?? '/secondary';

const sites: MountedSite[] = [
  {
    name: 'primary-web',
    basePath: '/',
    rootDir: primaryWebDist,
  },
  {
    name: 'secondary-web',
    basePath: secondaryBasePath,
    rootDir: secondaryWebDist,
  },
];

const server = createStaticHostServer({ sites });

server.listen(port, host, () => {
  console.log(`Web host listening on http://${host}:${port}`);
  for (const site of sites) {
    console.log(
      `${site.name} mounted at ${site.basePath} from ${site.rootDir}`,
    );
  }
});
