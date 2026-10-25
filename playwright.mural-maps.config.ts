import { defineConfig } from '@playwright/test';
import base from './playwright.map-assets.config';
export default defineConfig({ ...base, testMatch: ['mural-maps.spec.ts', 'map-assets.spec.ts'] });
