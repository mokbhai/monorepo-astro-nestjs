# Customizing The Template

## Rename The Scope

This starter uses the scope `@workspace-starter/*`. Replace it with your own organization or project scope in:

- root and workspace `package.json` files
- import statements
- TypeScript path aliases
- documentation examples

## Add A New App

1. Create a folder in `apps/`.
2. Add a `package.json` with workspace scripts.
3. Add its dependencies using `catalog:` and `workspace:*` where appropriate.
4. Make sure its scripts align with the root Turbo tasks.

## Add A Shared Package

1. Create a folder in `packages/`.
2. Add `package.json`, source files, and `tsconfig.json`.
3. Reference the shared config package if it is TypeScript-based.
4. Add build/typecheck scripts that fit the monorepo task graph.

## Environment Variables

Use [.env.example](/Users/mokshitjain/Codes/Company/JainParichay/Core/.env.example) as the template source for local environment setup.

## Replace The Showcase UI

The starter homepage is intentionally a showcase page. Replace its sections with your own product UI once the monorepo structure and shared packages are in place.
