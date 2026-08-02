import { PrismaClient } from '@prisma/client';

// `@jainparichay/db` is ESM-only and its package `exports` map has no
// `require` condition (only `import`), so a plain `import ... from
// '@jainparichay/db'` compiled to CommonJS `require()` fails at runtime with
// `ERR_PACKAGE_PATH_NOT_EXPORTED` — verified directly, not assumed. A
// dynamic `import()` is the only way to load it from this CJS app, so that
// gymnastic is centralized here (once) instead of duplicated across every
// consumer the way it was before this file existed.
let clientPromise: Promise<PrismaClient> | undefined;

export function getPrisma(): Promise<PrismaClient> {
  if (!clientPromise) {
    clientPromise = import('@jainparichay/db').then(
      ({ createDatabaseClient }) =>
        createDatabaseClient((adapter) => new PrismaClient({ adapter })),
    );
  }

  return clientPromise;
}

export type { PrismaClient };
