import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApi } from '@workspace-starter/api';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  createStaticHostServer,
  discoverMountedSites,
  tryServeStaticFile,
  type MountedSite,
} from './static-host.js';

type AstroHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

interface AstroRuntime {
  handler: AstroHandler;
}

interface ApiApplication {
  init(): Promise<unknown>;
  close(): Promise<unknown>;
  enableShutdownHooks(): void;
  listen(port: number, host: string): Promise<unknown>;
}

type ApiFactory = (options: {
  fastify: FastifyInstance;
  cors: false;
  initialize: false;
}) => Promise<ApiApplication>;

export interface CombinedHostOptions {
  sitesDir: string;
  primaryFrontend: string;
  astroRuntime?: AstroRuntime;
  fastify?: FastifyInstance;
  apiFactory?: ApiFactory;
}

export async function createCombinedHost(options: CombinedHostOptions) {
  const sites = discoverMountedSites(options.sitesDir, options.primaryFrontend);
  const primary = sites.find((site) => site.basePath === '/');
  if (!primary) {
    throw new Error('Combined web host requires a primary frontend.');
  }

  const secondarySites = sites.filter((site) => site.basePath !== '/');
  const staticPrimary = {
    ...primary,
    rootDir: path.join(primary.rootDir, 'client'),
  };
  const staticServer = createStaticHostServer({
    sites: [staticPrimary, ...secondarySites],
  });
  const fastify =
    options.fastify ??
    Fastify({
      logger: process.env.NODE_ENV !== 'test',
      trustProxy: true,
    });
  let app: ApiApplication | undefined;

  try {
    const astro = options.astroRuntime ?? (await loadAstroRuntime(primary));
    const apiFactory: ApiFactory = options.apiFactory ?? createApi;
    app = await apiFactory({ fastify, cors: false, initialize: false });

    fastify.all('/*', async (request, reply) => {
      const pathname = request.url.split('?', 1)[0] ?? '/';
      if (matchesSecondarySite(secondarySites, pathname)) {
        staticServer.emit('request', request.raw, reply.raw);
        return reply;
      }

      if (
        await tryServeStaticFile(
          request.raw,
          reply.raw,
          staticPrimary,
          pathname,
        )
      ) {
        return reply;
      }

      astro.handler(request.raw, reply.raw, (error?: unknown) => {
        if (error) {
          request.log.error(error);
          if (!reply.raw.headersSent) {
            reply.raw.statusCode = 500;
            reply.raw.end('Internal server error');
          }
        } else if (!reply.raw.writableEnded) {
          reply.raw.statusCode = 404;
          reply.raw.end('Not found');
        }
      });
      return reply;
    });

    await app.init();
    app.enableShutdownHooks();
    return { app, fastify, sites };
  } catch (error) {
    if (app) {
      await app.close().catch(() => undefined);
    } else {
      await fastify.close().catch(() => undefined);
    }
    throw error;
  }
}

async function loadAstroRuntime(primary: MountedSite): Promise<AstroRuntime> {
  const entryPath = path.resolve(primary.rootDir, 'server', 'entry.mjs');
  try {
    const runtime = (await import(
      pathToFileURL(entryPath).href
    )) as AstroRuntime;
    if (typeof runtime.handler !== 'function') {
      throw new Error('Astro runtime does not export a middleware handler.');
    }
    return runtime;
  } catch (error) {
    throw new Error(`Unable to load primary Astro runtime at ${entryPath}.`, {
      cause: error,
    });
  }
}

function matchesSecondarySite(sites: MountedSite[], pathname: string) {
  return sites.some(
    (site) =>
      pathname === site.basePath || pathname.startsWith(`${site.basePath}/`),
  );
}
