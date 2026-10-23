import { defineConfig } from '@playwright/test';
import base from './playwright.vtt.config';
const servers = base.webServer as { command: string; [key: string]: unknown }[];
export default defineConfig({
  ...base,
  testMatch: 'guided-combat.spec.ts',
  timeout: 90000,
  use: {
    ...base.use,
    hasTouch: true,
    launchOptions: {
      ...base.use?.launchOptions,
      args: [...(base.use?.launchOptions?.args ?? []), '--disable-gpu'],
    },
  },
  webServer: [
    servers[0],
    {
      ...servers[1],
      command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 0.0.0.0 --port 3100',
      timeout: 120000,
    },
  ],
});
