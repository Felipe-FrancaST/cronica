import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
export default defineConfig({ ...base, testMatch: 'magic-rules.spec.ts' });
