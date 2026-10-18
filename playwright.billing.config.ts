import { defineConfig } from '@playwright/test';
import config from './playwright.vtt.config';
const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer!];
export default defineConfig({
  ...config,
  testMatch: 'billing.spec.ts',
  timeout: 90000,
  webServer: servers.map((server, index) =>
    index === 0
      ? { ...server, command: 'node --import tsx tests/helpers/billing-fixture-server.ts' }
      : {
          ...server,
          env: {
            ...server.env,
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
            SUPABASE_SERVICE_ROLE_KEY: 'billing-test-service',
            MERCADO_PAGO_ACCESS_TOKEN: 'TEST-local-provider',
            MERCADO_PAGO_COLLECTOR_ID: '123',
            MERCADO_PAGO_WEBHOOK_SECRET: 'local-billing-signature-secret',
            MERCADO_PAGO_ENVIRONMENT: 'test',
            MERCADO_PAGO_TEST_API_URL: 'http://127.0.0.1:54329',
            CRON_SECRET: 'billing-local-cron-secret-at-least-32-characters',
          },
        },
  ),
});
