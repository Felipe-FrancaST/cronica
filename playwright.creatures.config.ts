import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
export default defineConfig({
  ...base,
  testMatch: ['creature-controls.spec.ts', 'direct-combat.spec.ts', 'spell-scenes.spec.ts'],
});
