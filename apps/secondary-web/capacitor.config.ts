import type { CapacitorConfig } from '@capacitor/cli';

const nodeEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const config: CapacitorConfig = {
  appId: nodeEnv?.CAPACITOR_APP_ID ?? 'com.workspacestarter.secondaryweb',
  appName: nodeEnv?.CAPACITOR_APP_NAME ?? 'Secondary Web',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
