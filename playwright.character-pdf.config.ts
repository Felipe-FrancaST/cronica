import { defineConfig } from '@playwright/test';
import fixtureConfig from './playwright.vtt.config';

export default defineConfig({
  ...fixtureConfig,
  testMatch: 'character-pdf.spec.ts',
  timeout: 90000,
});
