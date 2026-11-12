import { defineConfig, devices } from '@playwright/test';

// Corrida de aceptación del harness real (e2e/real). Se lanza con `npm run e2e:real`, que levanta
// Postgres desechable, el emulador de Auth, el backend y la web antes de llamar a esta config.
// Cero retries y un solo worker: los escenarios comparten una base sembrada y no se reintentan a ciegas.
export default defineConfig({
  testDir: './e2e/real',
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-real.json' }]],
  outputDir: 'test-results/e2e-real',
  use: {
    baseURL: process.env.E2E_REAL_BASE_URL,
    trace: 'retain-on-failure',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  projects: [{ name: 'real-chromium', use: { ...devices['Desktop Chrome'] } }],
});
