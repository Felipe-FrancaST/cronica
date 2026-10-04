import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'vtt.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            ...(process.env.PLAYWRIGHT_SINGLE_PROCESS === 'true'
              ? [
                  '--single-process',
                  '--no-zygote',
                  '--enable-unsafe-swiftshader',
                  '--use-angle=swiftshader',
                ]
              : []),
          ],
        }
      : undefined,
  },
  reporter: 'list',
});
