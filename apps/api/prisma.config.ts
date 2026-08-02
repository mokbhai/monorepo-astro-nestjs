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

// `prisma generate` never connects to a database — it only reads the schema
// — so it does not need a real `DATABASE_URL`. Falling back to a placeholder
// here (rather than throwing when it's unset, as this file used to) lets
// `postinstall`/`db:generate` be plain, portable `prisma generate` calls
// instead of the POSIX-only `DATABASE_URL="${DATABASE_URL:-...}" prisma
// generate` shell form, which fails outright on Windows (pnpm does not
// enable its shell emulator by default, so that syntax runs under `cmd.exe`
// there). Commands that genuinely connect (`migrate dev`, `migrate deploy`,
// `studio`) still need a real `DATABASE_URL` — they fail loudly on their own
// against this placeholder host, which is the same failure shape as before,
// just surfaced by Prisma's own connection error instead of this file.
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
