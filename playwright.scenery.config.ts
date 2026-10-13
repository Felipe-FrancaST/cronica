import { defineConfig } from '@playwright/test';
import config from './playwright.vtt.config';
export default defineConfig({
  ...config,
  timeout: 90000,
  testMatch: 'scenery-interactions.spec.ts',
});
