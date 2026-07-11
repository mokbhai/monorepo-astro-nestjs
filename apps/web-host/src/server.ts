import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCombinedHost } from './combined-host.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '4321', 10);
const sitesDir = process.env.SITES_DIR ?? path.resolve(moduleDir, '../sites');
const primaryFrontend = process.env.PRIMARY_FRONTEND ?? 'web';

async function bootstrap() {
  const { app, sites } = await createCombinedHost({
    sitesDir,
    primaryFrontend,
  });
  await app.listen(port, host);
  console.log(`Combined web host listening on http://${host}:${port}`);
  for (const site of sites) {
    console.log(
      `${site.name} mounted at ${site.basePath} from ${site.rootDir}`,
    );
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Combined web host startup failed:', error);
  process.exitCode = 1;
});
