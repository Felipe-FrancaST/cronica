import { defineConfig } from '@playwright/test';
import base from './playwright.map-assets.config';
export default defineConfig({
  ...base,
  testMatch: [
    'map-assets.spec.ts',
    'mural-maps.spec.ts',
    'canvas-switch.spec.ts',
    'guided-combat.spec.ts',
  ],
});
