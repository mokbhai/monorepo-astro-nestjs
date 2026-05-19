import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import { defaultLocale, locales } from './src/i18n/config';

const i18nLocales = [...locales];

export default defineConfig({
  output: 'static',
  adapter: node({
    mode: 'standalone',
  }),

  i18n: {
    locales: i18nLocales,
    defaultLocale,
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // Strategy A: UI package ships pre-built dist/
    // Tell Vite to pre-bundle it so it's optimized at dev startup
    optimizeDeps: {
      include: [
        '@workspace-starter/ui',
        '@trpc/client',
        '@tanstack/react-query',
      ],
    },
  },
});
