import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma CLI commands (and this file) always run with `apps/api` as cwd,
// even when invoked via the root `db:*` scripts (`pnpm --filter ... db:*`).
// A bare `import 'dotenv/config'` only ever resolves `apps/api/.env`, so a
// root `.env` — the file `cp .env.example .env` at the repo root produces,
// per README.md — is silently invisible here. Same fix as
// `src/app.module.ts`'s `ConfigModule.forRoot`: list both paths so the root
// `.env` is found from `apps/api`, and the app's own `.env` still wins if
// both exist.
config({ path: ['.env', '../../.env'] });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
