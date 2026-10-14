import { defineConfig } from '@playwright/test';
import config from './playwright.scenery.config';
export default defineConfig({ ...config, testMatch: 'scenery-performance.spec.ts' });
