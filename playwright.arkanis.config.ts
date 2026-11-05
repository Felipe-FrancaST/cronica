import { defineConfig } from '@playwright/test';
import config from './playwright.billing.config';
export default defineConfig({
  ...config,
  testMatch: ['arkanis.spec.ts', 'campaigns.spec.ts'],
  timeout: 90000,
});
