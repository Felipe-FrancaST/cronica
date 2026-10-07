import { defineConfig } from '@playwright/test';
import fixtureConfig from './playwright.vtt.config';

// Character integration tests use the same isolated API as the tactical table.
export default defineConfig({
  ...fixtureConfig,
  testMatch: 'multiclass.spec.ts',
});
