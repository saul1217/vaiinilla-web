import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, LOCAL_BASE_URL } from './e2e/base-url';

const REAL = /[\\/]real[\\/]/;

export default defineConfig({
  testDir: './e2e',
  // Referencias de capturas generadas en el contenedor fijo de Playwright (CI), sin sufijo de plataforma.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
    url: LOCAL_BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  // e2e/real usa su propia config (playwright.real.config.ts): web + backend + Postgres reales.
  // Va en cada proyecto porque el testIgnore de un proyecto reemplaza al global.
  projects: [
    { name: 'chromium', testIgnore: [/ui-regresion/, REAL], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: [/ui-regresion/, REAL], use: { ...devices['Pixel 7'] } },
    // QA-049: regresión de interfaz (capturas, axe, teclado). Los viewports los fija el propio spec.
    { name: 'ui-regresion', testMatch: /ui-regresion/, use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
  ],
});
