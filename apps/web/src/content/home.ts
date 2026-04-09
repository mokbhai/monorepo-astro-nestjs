export type HomeLocale = 'en' | 'de';

export interface HomeCopy {
  locale: HomeLocale;
  langLabel: string;
  nav: {
    architecture: string;
    pipeline: string;
    features: string;
    quickstart: string;
    github: string;
    docs: string;
    discord: string;
    changelog: string;
  };
  wordmark: string;
  version: string;
  hero: {
    eyebrow: string;
    titleLines: [string, string, string];
    accent: string;
    body: string;
    primary: string;
    secondary: string;
    command: string;
    copyIdle: string;
    copyDone: string;
  };
  architecture: {
    number: string;
    title: string;
    description: string;
    blueprintTitle: string;
  };
  pipeline: {
    number: string;
    title: string;
    description: string;
    stages: Array<{ icon: string; label: string; command: string }>;
  };
  features: {
    number: string;
    title: string;
    titleBreak: string;
    description: string;
    items: Array<{ title: string; body: string }>;
  };
  quickstart: {
    number: string;
    title: string;
    description: string;
    items: Array<{ title: string; body: string; command: string }>;
  };
  cta: {
    titleLines: [string, string];
    accent: string;
    body: string;
    action: string;
  };
  footer: {
    license: string;
  };
}

export const homeCopy: Record<HomeLocale, HomeCopy> = {
  en: {
    locale: 'en',
    langLabel: 'Deutsch',
    nav: {
      architecture: 'Architecture',
      pipeline: 'Pipeline',
      features: 'Features',
      quickstart: 'Quickstart',
      github: 'GitHub',
      docs: 'Documentation',
      discord: 'Discord',
      changelog: 'Changelog',
    },
    wordmark: 'mono/repo',
    version: 'v2.4',
    hero: {
      eyebrow: 'Monorepo Starter Kit',
      titleLines: ['One codebase,', 'every', 'connected'],
      accent: 'moving part',
      body:
        'Clone it, run pnpm dev, and instantly see how apps, shared packages, and Turborepo orchestrate your entire stack.',
      primary: 'Clone & Start',
      secondary: 'Explore the Architecture',
      command: 'npx create-turbo@latest my-monorepo',
      copyIdle: 'Copy command',
      copyDone: 'Copied',
    },
    architecture: {
      number: '01 — Architecture',
      title: 'Everything has a place',
      description:
        'Applications ship features. Packages share code. Tooling enforces standards. Each workspace has a clear job inside the starter.',
      blueprintTitle: 'Repository Layout',
    },
    pipeline: {
      number: '02 — Pipeline',
      title: 'Turborepo handles the graph',
      description:
        'Every task runs in the right order with caching and parallel execution. Change shared code and only the affected surfaces rebuild.',
      stages: [
        { icon: '⎔', label: 'Install', command: 'pnpm install' },
        { icon: '◇', label: 'Lint', command: 'pnpm lint' },
        { icon: '⬡', label: 'Build', command: 'pnpm build' },
        { icon: '△', label: 'Check', command: 'pnpm typecheck' },
        { icon: '→', label: 'Run', command: 'pnpm dev' },
      ],
    },
    features: {
      number: '03 — What You Get',
      title: 'Batteries included,',
      titleBreak: 'opinions optional',
      description:
        'Every piece is replaceable. Swap frameworks, add packages, or trim the stack back without losing the workspace foundation.',
      items: [
        {
          title: 'Workspace Protocols',
          body: 'Internal dependencies resolve locally with pnpm workspace links, which keeps versions aligned and avoids phantom installs.',
        },
        {
          title: 'Shared UI Package',
          body: 'The frontend imports from packages/ui like a real library, so the starter shows package boundaries instead of hiding them.',
        },
        {
          title: 'Typed API Sample',
          body: 'NestJS and tRPC already prove the path between the web app and backend without extra scaffolding.',
        },
        {
          title: 'Parallel Execution',
          body: 'Turbo runs the right tasks together and respects dependencies automatically, so local workflows stay fast as the repo grows.',
        },
        {
          title: 'Reusable Config',
          body: 'TypeScript baselines live in packages/config-typescript and can be shared across apps, libraries, and future tooling.',
        },
        {
          title: 'Starter-Ready Structure',
          body: 'The folder layout is already shaped for real teams: applications on top, shared packages beneath, tooling at the root.',
        },
      ],
    },
    quickstart: {
      number: '04 — Quickstart',
      title: 'Running in ninety seconds',
      description:
        'Three commands. No global installs, no scavenger hunt through config files, and no guesswork about what runs where.',
      items: [
        {
          title: 'Clone the repo',
          body: 'Pull the template down and install every workspace dependency in one shot.',
          command: 'git clone <repo> && pnpm i',
        },
        {
          title: 'Start developing',
          body: 'Turbo boots the web app, API, and package watchers with the correct dependency order.',
          command: 'pnpm dev',
        },
        {
          title: 'Verify the graph',
          body: 'Build and typecheck across the workspace to confirm the monorepo is healthy before customizing it.',
          command: 'pnpm build && pnpm typecheck',
        },
      ],
    },
    cta: {
      titleLines: ['Ready to stop configuring', 'and start shipping?'],
      accent: 'start shipping',
      body: 'Open source. MIT licensed. Built with Turborepo + pnpm.',
      action: 'Get Started',
    },
    footer: {
      license: 'mono/repo — MIT License',
    },
  },
  de: {
    locale: 'de',
    langLabel: 'English',
    nav: {
      architecture: 'Architektur',
      pipeline: 'Pipeline',
      features: 'Merkmale',
      quickstart: 'Schnellstart',
      github: 'GitHub',
      docs: 'Dokumentation',
      discord: 'Discord',
      changelog: 'Changelog',
    },
    wordmark: 'mono/repo',
    version: 'v2.4',
    hero: {
      eyebrow: 'Monorepo-Starter-Kit',
      titleLines: ['Eine Codebasis,', 'jede', 'verbunden'],
      accent: 'bewegliche Stelle',
      body:
        'Repo klonen, pnpm dev starten und sofort sehen, wie Apps, gemeinsame Pakete und Turborepo den gesamten Stack zusammenführen.',
      primary: 'Klonen & Starten',
      secondary: 'Architektur ansehen',
      command: 'npx create-turbo@latest mein-monorepo',
      copyIdle: 'Befehl kopieren',
      copyDone: 'Kopiert',
    },
    architecture: {
      number: '01 — Architektur',
      title: 'Alles hat seinen Platz',
      description:
        'Applikationen liefern Features. Pakete teilen Code. Tooling setzt Standards. Jeder Workspace hat eine klare Aufgabe im Starter.',
      blueprintTitle: 'Repository-Struktur',
    },
    pipeline: {
      number: '02 — Pipeline',
      title: 'Turborepo verwaltet den Graphen',
      description:
        'Jede Aufgabe läuft in der richtigen Reihenfolge mit Caching und Parallelisierung. Änderungen an gemeinsamem Code bauen nur betroffene Flächen neu.',
      stages: [
        { icon: '⎔', label: 'Installieren', command: 'pnpm install' },
        { icon: '◇', label: 'Lint', command: 'pnpm lint' },
        { icon: '⬡', label: 'Build', command: 'pnpm build' },
        { icon: '△', label: 'Check', command: 'pnpm typecheck' },
        { icon: '→', label: 'Starten', command: 'pnpm dev' },
      ],
    },
    features: {
      number: '03 — Enthalten',
      title: 'Batterien inklusive,',
      titleBreak: 'Meinungen optional',
      description:
        'Jeder Teil ist austauschbar. Frameworks lassen sich ersetzen oder erweitern, ohne das Workspace-Fundament aufzugeben.',
      items: [
        {
          title: 'Workspace-Protokolle',
          body: 'Interne Abhängigkeiten werden lokal über pnpm Workspace-Links aufgelöst, was Versionen zusammenhält und Phantom-Installationen vermeidet.',
        },
        {
          title: 'Gemeinsames UI-Paket',
          body: 'Das Frontend importiert aus packages/ui wie aus einer echten Bibliothek, sodass Paketgrenzen sichtbar bleiben.',
        },
        {
          title: 'Typisiertes API-Beispiel',
          body: 'NestJS und tRPC beweisen den Pfad zwischen Web-App und Backend bereits ohne zusätzliche Grundarbeit.',
        },
        {
          title: 'Parallele Ausführung',
          body: 'Turbo startet die richtigen Aufgaben gemeinsam und berücksichtigt Abhängigkeiten automatisch, damit lokale Abläufe schnell bleiben.',
        },
        {
          title: 'Wiederverwendbare Konfiguration',
          body: 'TypeScript-Baselines liegen in packages/config-typescript und lassen sich über Apps, Bibliotheken und zukünftiges Tooling teilen.',
        },
        {
          title: 'Starter-taugliche Struktur',
          body: 'Die Ordnerstruktur ist bereits für echte Teams ausgelegt: Applikationen oben, gemeinsame Pakete darunter, Tooling an der Wurzel.',
        },
      ],
    },
    quickstart: {
      number: '04 — Schnellstart',
      title: 'Läuft in neunzig Sekunden',
      description:
        'Drei Befehle. Keine globalen Installationen, keine Suche durch Konfigurationsdateien und kein Rätselraten darüber, was wo startet.',
      items: [
        {
          title: 'Repo klonen',
          body: 'Vorlage herunterladen und alle Workspace-Abhängigkeiten in einem Schritt installieren.',
          command: 'git clone <repo> && pnpm i',
        },
        {
          title: 'Entwicklung starten',
          body: 'Turbo startet Web-App, API und Paket-Watcher in der korrekten Abhängigkeitsreihenfolge.',
          command: 'pnpm dev',
        },
        {
          title: 'Graph prüfen',
          body: 'Build und Typecheck über den Workspace ausführen, bevor die Vorlage angepasst wird.',
          command: 'pnpm build && pnpm typecheck',
        },
      ],
    },
    cta: {
      titleLines: ['Bereit, Konfiguration zu beenden', 'und auszuliefern?'],
      accent: 'auszuliefern',
      body: 'Open Source. MIT-lizenziert. Gebaut mit Turborepo + pnpm.',
      action: 'Loslegen',
    },
    footer: {
      license: 'mono/repo — MIT-Lizenz',
    },
  },
};

export const homeBlueprint = [
  { label: 'apps/', level: 0, color: 'teal', dir: true },
  { label: 'web/', level: 1, color: 'teal' },
  { label: 'api/', level: 1, color: 'coral' },
  { label: 'packages/', level: 0, color: 'indigo', dir: true },
  { label: 'ui/', level: 1, color: 'indigo' },
  { label: 'types/', level: 1, color: 'amber' },
  { label: 'config-typescript/', level: 1, color: 'ghost' },
  { label: 'turbo.json', level: 0, color: 'ghost' },
  { label: 'pnpm-workspace.yaml', level: 0, color: 'ghost' },
  { label: 'package.json', level: 0, color: 'ghost' },
] as const;

export const homePackages = [
  {
    title: 'apps/web',
    path: 'Astro + React',
    body: 'The visual entrypoint for the starter. It renders the landing page, hosts the React islands, and proves workspace wiring from the first run.',
    tone: 'teal',
  },
  {
    title: 'apps/api',
    path: 'NestJS + tRPC',
    body: 'A typed backend sample that gives the starter a real server path instead of a placeholder architecture diagram.',
    tone: 'coral',
  },
  {
    title: 'packages/ui',
    path: 'Shared components',
    body: 'Reusable UI primitives that can be imported across apps as a real workspace package instead of copied local code.',
    tone: 'indigo',
  },
  {
    title: 'packages/types',
    path: 'Shared contracts',
    body: 'Common interfaces and DTOs that keep frontend and backend examples grounded in a typed, shared source of truth.',
    tone: 'amber',
  },
] as const;
