import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Referencias de capturas generadas en el contenedor fijo de Playwright (CI), sin sufijo de plataforma.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', testIgnore: /ui-regresion/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: /ui-regresion/, use: { ...devices['Pixel 7'] } },
    // QA-049: regresión de interfaz (capturas, axe, teclado). Los viewports los fija el propio spec.
    { name: 'ui-regresion', testMatch: /ui-regresion/, use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
  ],
});
