import { defineConfig, devices } from '@playwright/test';

/**
 * E2E con Playwright.
 *
 * Los smoke tests corren contra el build de producción servido con
 * `vite preview`, sin variables de Supabase: la app queda en modo local
 * y se valida el shell completo (routing, login, PWA, tema).
 *
 * Los flujos con datos reales (login → subir → revisar → exportar)
 * requieren un proyecto Supabase de staging: se configuran vía
 * E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY (ver e2e/README.md).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
