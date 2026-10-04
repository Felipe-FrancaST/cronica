import { test as base } from '@playwright/test';

// Chromium in single-process environments cannot reuse a browser after closing
// an incognito context. Isolate each page only when that mode is requested.
export const test =
  process.env.PLAYWRIGHT_SINGLE_PROCESS === 'true'
    ? base.extend({
        page: async ({ playwright, launchOptions, baseURL, viewport, hasTouch }, use) => {
          const browser = await playwright.chromium.launch(launchOptions);
          try {
            const context = await browser.newContext({ baseURL, viewport, hasTouch });
            const page = await context.newPage();
            await use(page);
          } finally {
            await browser.close();
          }
        },
      })
    : base;
