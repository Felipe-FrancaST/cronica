import { defineConfig } from '@playwright/test';
import config from './playwright.billing.config';
export default defineConfig({ ...config, testMatch: 'account-deletion.spec.ts' });
