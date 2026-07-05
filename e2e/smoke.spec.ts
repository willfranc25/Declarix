import { test, expect } from '@playwright/test';

/**
 * Smoke tests del shell de la aplicación (sin backend).
 * Sin credenciales Supabase la app opera en modo local y las rutas
 * protegidas redirigen a /login: eso es exactamente lo que se valida.
 */

test('la raíz redirige a login cuando no hay sesión', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('la página de login muestra la marca y el formulario', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveTitle(/Declarix/);
  await expect(page.getByText('Declarix').first()).toBeVisible();
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(page.locator('button[type="submit"]').first()).toBeVisible();

  // Sin restos del branding anterior
  await expect(page.locator('body')).not.toContainText('Saludent');
});

test('las rutas protegidas exigen sesión', async ({ page }) => {
  for (const route of ['/upload', '/reports', '/settings']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('no hay errores de consola al cargar el login', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});
