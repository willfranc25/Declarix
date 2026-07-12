import { test, expect } from '@playwright/test';

/**
 * Smoke tests del shell de la aplicación (sin backend).
 * Sin credenciales Supabase la app opera en modo local y las rutas
 * protegidas redirigen a /login: eso es exactamente lo que se valida.
 */

test('la raíz muestra la landing pública sin sesión', async ({ page }) => {
  await page.goto('/');
  // No redirige: es la página de venta
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('.landing-h1')).toContainText('rendición');
  // Precio visible: un solo plan, todo incluido
  await expect(page.locator('#precios .plan')).toHaveCount(1);
  await expect(page.locator('#precios')).toContainText('Todo incluido');
  // CTA lleva al login
  await page.getByRole('link', { name: 'Crear cuenta gratis' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test('las páginas legales son públicas', async ({ page }) => {
  await page.goto('/terminos');
  await expect(page.locator('h1')).toContainText('Términos');
  await page.goto('/privacidad');
  await expect(page.locator('h1')).toContainText('privacidad');
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
