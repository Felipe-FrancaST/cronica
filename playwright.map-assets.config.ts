import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
const servers = base.webServer as {
  command: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}[];
export default defineConfig({
  ...base,
  testMatch: 'map-assets.spec.ts',
  webServer: [
    servers[0],
    {
      ...servers[1],
      env: {
        ...servers[1].env,
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
        SUPABASE_SERVICE_ROLE_KEY: 'local-assets-service-role',
      },
    },
  ],
});
