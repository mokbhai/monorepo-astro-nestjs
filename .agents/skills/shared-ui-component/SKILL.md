---
name: shared-ui-component
description: Use when adding or changing reusable React components consumed via @jainparichay/ui, or app-local components in apps/web, for the JainParichay template-jp monorepo, especially when component location, CVA variants, cn class merging, src/index.ts exports, React peer dependencies, tsup build behavior, or apps/web usage needs to stay aligned.
---

# Shared UI Component

## Overview

Use this skill to keep shared UI components small, reusable, and safe to consume from `apps/web`. Prefer the repo's current React library pattern over introducing a new component architecture.

**`@jainparichay/ui` is not a local workspace in this repo.** It is published from a separate repo, [github.com/JainParichay/packages](https://github.com/JainParichay/packages) (`packages/ui` there), and consumed here as an ordinary `@jainparichay/ui` dependency. The component-shape, exports, and dependency-boundary guidance below describes the pattern that package follows, for reference when you need to add or change a component there — but doing so means making the change in the packages repo and publishing a new version, not editing anything under `template-jp`. This skill's guidance for `apps/web` itself (Web Usage, app-local component decisions) applies directly in this repo.

## First Decide If It Belongs In @jainparichay/ui

A component belongs in `@jainparichay/ui` only when it is a reusable primitive or cross-app building block needed outside this one product. Keep it local to `apps/web` when it is tied to one page, one data shape, one route, tRPC calls, Astro content, or business copy.

If a request asks to put a domain-specific component into `@jainparichay/ui`, push back and recommend a local web component unless the component can be named and used without JainParichay-specific data or copy. If the component genuinely is reusable, the change belongs in the packages repo.

## Component Shape

The `@jainparichay/ui` package uses this layout (in the packages repo):

```text
packages/ui/src/components/ComponentName/ComponentName.tsx
```

Use `PascalCase` for the folder, file, exported component, and props type. Keep component files self-contained unless there is real shared logic worth extracting.

Follow this pattern for Tailwind variants:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';

const badgeVariants = cva('inline-flex items-center font-medium', {
  variants: {
    variant: {
      default: 'bg-slate-950 text-white',
      outline: 'border border-slate-300 text-slate-900',
    },
    size: {
      sm: 'h-6 px-2 text-xs',
      md: 'h-8 px-3 text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}
```

For button-like controls, mirror `packages/ui/src/components/Button/Button.tsx`: extend the correct native element attributes, preserve `disabled`, focus-visible, hover, and icon-size states, and let consumers pass `className`.

## Exports

Every public component must be exported from `@jainparichay/ui`'s `src/index.ts` (in the packages repo):

```ts
export { Badge } from './components/Badge/Badge';
export type { BadgeProps } from './components/Badge/Badge';
```

Do not import consumers from internal component paths. If a component is not ready to be public API, keep it unexported and do not use it from `apps/web`.

## Dependencies And Build Boundaries

Keep `react` and `react-dom` as peer dependencies and tsup externals. Do not move them to regular dependencies.

Use dependency categories deliberately:

- `dependencies`: runtime helpers bundled or resolved by the UI package, such as `class-variance-authority`, `clsx`, and `tailwind-merge`.
- `peerDependencies`: React singletons or host-owned UI runtimes that the app must provide.
- `devDependencies`: build tools, TypeScript, eslint, and type packages.

Prefer existing `catalog:` entries from `pnpm-workspace.yaml` for shared versions. Add new runtime dependencies only when the component cannot be implemented cleanly with current dependencies.

## Web Usage

Use package imports from web code:

```tsx
import { Badge, Button } from '@jainparichay/ui';

export function ExampleActions() {
  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline">Verified</Badge>
      <Button size="sm">Continue</Button>
    </div>
  );
}
```

For Astro pages, import from the package root too:

```astro
---
import { Button } from '@jainparichay/ui';
---

<Button variant="default" size="lg">Create profile</Button>
```

Only add a `client:*` directive when the shared component or its children need browser interactivity. `@jainparichay/ui` is an ordinary published dependency of `apps/web` — there is no local `packages/ui` to import from directly.

`apps/web/astro.config.ts` already includes `@jainparichay/ui` in Vite's `optimizeDeps` (it ships a pre-built `dist/`). `apps/web/tsconfig.json` has no path alias for it — it resolves through normal `node_modules` package resolution like any other dependency. Do not edit either file for a normal new component; a new export inside the package needs a version bump in the packages repo before it is usable here at all.

## Quality Bar

- Keep shared components free of data fetching, routing, app-specific copy, and tRPC calls.
- Use accessible native elements first. For icon-only controls, require an accessible name.
- Preserve `className` passthrough and merge it with `cn`.
- Keep variants small and predictable. Avoid one-off visual states that only one page needs.
- Avoid adding a new design system layer until multiple components prove the need.
- Keep styling in Tailwind utilities and CVA; do not add CSS files unless the component truly cannot be expressed with existing styling tools.

## Verification

`@jainparichay/ui` is not a local workspace, so `pnpm --filter` cannot target it. Verify a change there with the packages repo's own commands (`pnpm --filter @jainparichay/ui lint`, `typecheck`, `build`) before publishing a new version.

For a change made in this repo (bumping the `@jainparichay/ui` version, or an app-local component in `apps/web`), run the narrowest checks that prove the changed surface:

```bash
pnpm --filter @workspace-starter/web typecheck
```

Run broader `pnpm typecheck` or `pnpm build` when exports, dependency graph, package manifests, or shared runtime behavior changed.
