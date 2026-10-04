import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'vtt.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-angle=swiftshader',
        ...(process.env.PLAYWRIGHT_SINGLE_PROCESS === 'true'
          ? ['--single-process', '--no-zygote']
          : []),
      ],
    },
  },
  webServer: [
    {
      command: 'node --import tsx tests/helpers/vtt-fixture-server.ts',
      url: 'http://127.0.0.1:54329/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 3100',
      url: 'http://localhost:3100/entrar',
      timeout: 90000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'vtt-local-test-key',
        NEXT_PUBLIC_ENABLE_DEMO: 'false',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
