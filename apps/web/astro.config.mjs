import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // Strategy A: UI package ships pre-built dist/
    // Tell Vite to pre-bundle it so it's optimized at dev startup
    optimizeDeps: {
      include: ['@workspace-starter/ui', '@trpc/client', '@tanstack/react-query'],
    },
  },
});
