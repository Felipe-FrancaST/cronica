import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
export default defineConfig({ ...base, testMatch: 'direct-combat.spec.ts' });
