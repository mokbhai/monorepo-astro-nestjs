// Must be imported first, before any other local module, in every entry
// point that can trigger `./prisma/client`'s module-scope
// `createDatabaseClient()` call (see `bootstrap.ts`). In the emitted
// CommonJS, `require`s run top-to-bottom before the rest of a file's body —
// including the `@Module({...})` decorator call in `app.module.ts` that
// invokes `ConfigModule.forRoot({ envFilePath: ['.env', '../../.env'] })`.
// By the time that decorator runs, `require('./app.module')` has already
// pulled in `./prisma/prisma.module` → `./prisma/client`, which reads
// `process.env.DATABASE_URL` eagerly. So `ConfigModule.forRoot()` populates
// `process.env` too late to help the first import of `client.ts` — this
// module loads the same `.env` files directly, synchronously, before any of
// that chain is required.
import { config } from 'dotenv';

config({ path: ['.env', '../../.env'] });
