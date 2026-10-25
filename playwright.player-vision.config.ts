import { defineConfig } from '@playwright/test';
import base from './playwright.creatures.config';
export default defineConfig({ ...base, testMatch: 'player-vision.spec.ts' });
