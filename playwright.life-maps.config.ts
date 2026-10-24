import { defineConfig } from '@playwright/test';
import base from './playwright.guided-combat.config';
export default defineConfig({ ...base, testMatch: 'life-maps.spec.ts' });
