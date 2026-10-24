import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
export default defineConfig({ ...base, testMatch: 'sheet-usability.spec.ts' });
