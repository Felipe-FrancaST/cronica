import { defineConfig } from '@playwright/test';
import fixtureConfig from './playwright.vtt.config';
export default defineConfig({ ...fixtureConfig, testMatch: 'items.spec.ts' });
