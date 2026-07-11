import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { createCombinedHost } from '../dist/combined-host.js';

async function createSites(t) {
  const sitesDir = await mkdtemp(path.join(tmpdir(), 'combined-host-'));
  t.after(() => rm(sitesDir, { recursive: true, force: true }));
  await mkdir(path.join(sitesDir, 'web', 'client', '_astro'), {
    recursive: true,
  });
  await mkdir(path.join(sitesDir, 'secondary-web'), { recursive: true });
  await writeFile(
    path.join(sitesDir, 'web', 'client', '_astro', 'app.js'),
    'asset',
  );
  await writeFile(
    path.join(sitesDir, 'web', 'client', 'extensionless'),
    'public',
  );
  await writeFile(
    path.join(sitesDir, 'secondary-web', 'index.html'),
    '<h1>Secondary</h1>',
  );
  return sitesDir;
}

function astroRuntime() {
  return {
    handler(request, response) {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/redirect') {
        response.statusCode = 307;
        response.setHeader('Location', '/target');
        response.end();
      } else if (pathname === '/cookie') {
        response.setHeader('Set-Cookie', 'session=value; HttpOnly; Path=/');
        response.end('cookie');
      } else if (pathname === '/stream') {
        response.setHeader('X-Astro', 'stream');
        response.write('first-');
        setImmediate(() => response.end('second'));
      } else {
        response.setHeader('X-Astro', 'ssr');
        response.end(request.method === 'HEAD' ? undefined : `SSR ${pathname}`);
      }
    },
  };
}

function apiFactory({ fastify }) {
  fastify.all('/trpc/*', (_request, reply) => {
    reply.code(404).send({ error: 'reserved API route' });
  });
  return Promise.resolve({
    init: () => fastify.ready(),
    close: () => fastify.close(),
    enableShutdownHooks() {},
    listen: (port, host) => fastify.listen({ port, host }),
  });
}

async function startCombined(t, options = {}) {
  const sitesDir = await createSites(t);
  const host = await createCombinedHost({
    sitesDir,
    primaryFrontend: 'web',
    astroRuntime: astroRuntime(),
    apiFactory,
    ...options,
  });
  await host.app.listen(0, '127.0.0.1');
  t.after(() => host.app.close());
  const address = host.fastify.server.address();
  assert.equal(typeof address, 'object');
  return { ...host, origin: `http://127.0.0.1:${address.port}` };
}

test('API and reserved API paths take precedence over Astro', async (t) => {
  const { origin } = await startCombined(t);
  const response = await fetch(`${origin}/trpc/not-a-procedure`);
  assert.notEqual(response.status, 200);
  assert.equal(response.headers.get('x-astro'), null);
  assert.doesNotMatch(await response.text(), /SSR/);
});

test('serves primary static assets before Astro with safe extensionless fallback', async (t) => {
  const { origin } = await startCombined(t);
  const [asset, extensionless] = await Promise.all([
    fetch(`${origin}/_astro/app.js`),
    fetch(`${origin}/extensionless`),
  ]);
  assert.equal(await asset.text(), 'asset');
  assert.equal(
    asset.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(await extensionless.text(), 'public');
  assert.equal(extensionless.headers.get('x-astro'), null);
});

test('passes SSR headers, redirects, cookies, streaming, GET, and HEAD through Astro', async (t) => {
  const { origin } = await startCombined(t);
  const [ssr, redirect, cookie, stream, head] = await Promise.all([
    fetch(`${origin}/dynamic`),
    fetch(`${origin}/redirect`, { redirect: 'manual' }),
    fetch(`${origin}/cookie`),
    fetch(`${origin}/stream`),
    fetch(`${origin}/dynamic`, { method: 'HEAD' }),
  ]);
  assert.equal(await ssr.text(), 'SSR /dynamic');
  assert.equal(ssr.headers.get('x-astro'), 'ssr');
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('location'), '/target');
  assert.match(cookie.headers.get('set-cookie'), /session=value/);
  assert.equal(await stream.text(), 'first-second');
  assert.equal(stream.headers.get('x-astro'), 'stream');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('x-astro'), 'ssr');
});

test('serves static secondary applications and redirects their base path', async (t) => {
  const { origin } = await startCombined(t);
  const redirect = await fetch(`${origin}/secondary-web`, {
    redirect: 'manual',
  });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/secondary-web/');
  const response = await fetch(`${origin}/secondary-web/`);
  assert.match(await response.text(), /Secondary/);
  assert.equal(response.headers.get('x-astro'), null);
});

test('closes Fastify when combined-host setup fails', async (t) => {
  const sitesDir = await createSites(t);
  const fastify = Fastify();
  fastify.addHook('onClose', () => {
    fastify.closedByTest = true;
  });
  fastify.all('/*', () => undefined);
  await assert.rejects(
    createCombinedHost({
      sitesDir,
      primaryFrontend: 'web',
      fastify,
      astroRuntime: astroRuntime(),
      apiFactory,
    }),
    /already declared/,
  );
  assert.equal(fastify.closedByTest, true);
  assert.equal(fastify.server.listening, false);
});
