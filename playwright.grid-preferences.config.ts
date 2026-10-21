import { defineConfig } from '@playwright/test';
import config from './playwright.vtt.config';
export default defineConfig({ ...config, testMatch: 'grid-preferences.spec.ts', timeout: 90000 });
