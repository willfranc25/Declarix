# Tests E2E (Playwright)

## Smoke (sin backend) — corren siempre

```bash
npm run build
npx playwright test --project=chromium
```

Validan el shell de la app contra `vite preview`: routing, redirección a
login, branding, ausencia de errores de consola. No necesitan Supabase.

## Flujo completo (staging) — requieren infraestructura

El flujo crítico completo (login → subir boleta → revisar → exportar) necesita:

1. Un proyecto Supabase de **staging** con las migraciones aplicadas.
2. Un usuario de prueba (`e2e@test.com`) creado en ese proyecto.
3. Variables al correr:
   ```bash
   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
   E2E_USER=e2e@test.com E2E_PASSWORD=... npx playwright test
   ```
4. Mock del endpoint de IA (`page.route('/api/extract', ...)`) para no gastar
   cuota real del proveedor.

Estos specs se agregan en `e2e/flows/` cuando exista el proyecto de staging;
no deben correr contra producción.
