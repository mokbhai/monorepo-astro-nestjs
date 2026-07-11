# Astro 7 migration notes

Both `apps/web` and `apps/secondary-web` use Astro 7. The primary app uses the Astro Node adapter in middleware mode and is loaded by the shared Fastify/NestJS host; secondary apps remain static builds.

## Relevant changes

- **Vite 8:** Astro 7 uses Vite 8 and Rolldown. The repository's Tailwind Vite plugin, dependency optimization, Vitest setup, static build, and Node middleware build pass the full verification suite.
- **Rust compiler:** Astro's Rust compiler is now mandatory and stricter about unclosed tags and invalid nesting. All repository templates compile without diagnostics. Generated CSS can differ textually while remaining equivalent, so tests avoid exact CSS snapshots.
- **Sätteri Markdown parser:** Astro 7 replaces the previous Markdown parser with Sätteri. These apps do not render Markdown or use content collections, so no source migration was required.
- **JSX whitespace:** `compressHTML` now defaults to `'jsx'`. Newlines between elements no longer imply a rendered space. The reviewed templates either do not require inter-element spaces or express their intended adjacency directly. The real-render integration test locks down whitespace-sensitive wordmark and hero-heading output; use an explicit `{' '}` if future adjacent inline elements require a space.

## Repository review conclusions

No removed experimental flags, `src/fetch.ts`, custom Astro adapter APIs, direct SSR manifest access, transition migration, image pipeline usage, or content collection migration was found. `PUBLIC_API_URL` is the only `import.meta.env` use and is already treated as a public string.

The integration test in `tests/astro7-combined-host.test.mjs` builds and stages both real applications, imports the generated `server/entry.mjs`, starts the combined host with an injected database-free API factory, and verifies SSR HTML, immutable client assets, static secondary output, and the generated middleware handler contract.

See the [official Astro 7 upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/) for the complete framework migration reference.
