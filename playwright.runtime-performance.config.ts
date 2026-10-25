import { defineConfig } from '@playwright/test';
import base from './playwright.creatures.config';
export default defineConfig({
  ...base,
  testMatch: ['runtime-performance.spec.ts', 'scenery-performance.spec.ts'],
});
