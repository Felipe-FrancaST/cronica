import { defineConfig } from '@playwright/test';
import fixtureConfig from './playwright.vtt.config';

export default defineConfig({
  ...fixtureConfig,
  use: { ...fixtureConfig.use, hasTouch: true },
  testMatch: 'creation-media.spec.ts',
  timeout: 90000,
});
