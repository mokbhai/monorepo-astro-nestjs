import { PrismaClient } from '@prisma/client';
import { createDatabaseClient } from '@jainparichay/db';

// `@jainparichay/db@0.2.1` ships a `require` condition alongside `import`, so
// this CommonJS app can depend on it directly — no dynamic `import()`
// gymnastic needed. `createDatabaseClient` calls `requireDatabaseUrl`
// eagerly, so this throws at import time when `DATABASE_URL` is unset,
// which is the hard-fail-at-startup behavior this app already promises.
export const prisma = createDatabaseClient(
  (adapter) => new PrismaClient({ adapter }),
);

export type { PrismaClient };
