# Auditoría técnica — Declarix (pre-Fase 1)

Fecha: 2026-07-05. Alcance: revisión completa del repo (código fuente, migraciones,
configuración de build y despliegue) con foco en seguridad, multi-tenancy y
preparación para venta como SaaS B2B en Chile.

Leyenda: 🔴 Crítico (bloquea seguridad o venta) · 🟠 Alto (afecta confiabilidad/UX
seriamente) · 🟡 Medio (mejora importante, no bloqueante) · 🟢 Bajo (nice-to-have).

Costo estimado: S (< 1 h), M (medio día), L (1–3 días), XL (> 3 días).

---

## 🔴 Críticos

### C1. Migración RLS rota duplicada (`migrations/add_auth_and_rls.sql`)
- **Hallazgo**: las políticas de `UPDATE`/`DELETE` sobre `invoices` (líneas 60–64)
  mezclan `DROP POLICY IF EXISTS ... FOR UPDATE USING (...)` — sintaxis inválida —
  y falta el `CREATE POLICY`. Existe una **segunda copia corregida** en
  `supabase/migrations/20250115000001_add_auth_and_rls.sql` con las políticas bien
  escritas. Dos fuentes de verdad, una rota: quien ejecute la copia de `migrations/`
  deja `invoices` con RLS habilitado pero **sin política de UPDATE/DELETE** (los
  updates/deletes fallan silenciosamente para todos) o con error a mitad de script.
- **Impacto/Riesgo**: aislamiento de datos no garantizado; base insegura para
  multi-cliente. Riesgo operacional de aplicar la versión equivocada.
- **Costo**: S. **Propuesta**: eliminar la copia rota; `supabase/migrations/` queda
  como única fuente de verdad, y una migración nueva re-crea todas las políticas de
  forma idempotente (ver C2/C3). **→ Resuelto en Fase 1.**

### C2. Tabla `settings` sin migración y sin RLS — expone API keys entre usuarios
- **Hallazgo**: `supabaseProvider.js` lee/escribe una tabla `public.settings`
  (`key = "${userId}:${clave}"`, `value`) que **no existe en ninguna migración** y
  por lo tanto no tiene RLS. Ahí se guarda `vlm_api_key` (la API key de OpenAI/Gemini
  del usuario). Cualquier usuario autenticado puede leer y sobrescribir los settings
  —incluidas las API keys— de cualquier otro usuario consultando la tabla directamente
  con el anon key.
- **Impacto/Riesgo**: fuga de credenciales de terceros y manipulación de configuración
  ajena. Es el hallazgo más grave no listado en la especificación.
- **Costo**: M. **Propuesta**: migración que crea/normaliza `settings` con columna
  `user_id`, backfill desde el prefijo de `key`, RLS `FOR ALL USING/WITH CHECK
  (auth.uid() = user_id)`; el provider pasa a escribir `user_id` explícito.
  **→ Resuelto en Fase 1.**

### C3. Bucket `images` sin aislamiento por usuario
- **Hallazgo**: las imágenes de boletas se suben a la **raíz** del bucket `images`
  como `<invoiceId>.<ext>` con `upsert: true`, sin carpeta por usuario y sin políticas
  de `storage.objects` en las migraciones. Según cómo se creó el bucket, las imágenes
  son públicas o accesibles/sobrescribibles por cualquier usuario autenticado
  (basta adivinar/conocer un UUID). Datos financieros sensibles.
- **Impacto/Riesgo**: lectura y sobrescritura cruzada de comprobantes entre clientes.
- **Costo**: M. **Propuesta**: bucket privado, rutas `"<user_id>/<invoiceId>.<ext>"`,
  políticas de storage que exigen que la primera carpeta sea `auth.uid()`, lectura
  con URLs firmadas o `download()` autenticado; fallback de lectura para archivos
  legacy en raíz. **→ Resuelto en Fase 1** (compresión/miniaturas quedan para Fase 3).

### C4. API key de IA vive en el navegador (`vlmService.js`)
- **Hallazgo**: confirmado según especificación. El navegador llama directo a
  `api.openai.com` / `generativelanguage.googleapis.com` con una key que el usuario
  pega en Configuración; la key viaja y se almacena en el cliente y además queda
  incluida **en texto plano en los backups ZIP** (`settings.json` del backup).
- **Impacto/Riesgo**: inviable para pymes no técnicas; exposición de credenciales;
  imposible medir/limitar consumo por plan.
- **Costo**: L. **Propuesta**: función serverless `/api/extract` (Vercel) que verifica
  la sesión Supabase, llama al proveedor con key de servidor, registra consumo en
  `usage_events` y aplica límite mensual. La key propia queda como opción avanzada
  oculta. Los backups dejan de incluir la key. **→ Resuelto en Fase 1.**

### C5. Hardcodeo del cliente "Saludent" en todo el producto
- **Hallazgo**: confirmado según especificación — manifest PWA (`vite.config.js`),
  `index.html` (title/meta), `Sidebar.jsx`, `LoginPage.jsx`, base Dexie
  `boletas-saludent-db`, claves `saludent_mapping_*`, nombre de backups, textos de
  exportación y comentarios.
- **Impacto/Riesgo**: imposible vender a un segundo cliente; imagen no profesional.
- **Costo**: M. **Propuesta**: renombrar a **Declarix** (nombre del repo) en todos los
  puntos, con migración transparente de la base Dexie local y fallback de lectura para
  las claves de mapping legacy (sin pérdida de datos). **→ Resuelto en Fase 1.**

---

## 🟠 Altos

### A1. Dos clientes Supabase simultáneos
- `supabaseClient.js` crea un cliente (usado por Auth) y `supabaseProvider.js` crea
  **otro** con la misma URL/key. Dos instancias de GoTrue compiten por la misma
  sesión en localStorage (warning conocido de supabase-js; riesgo de sesión
  inconsistente y refresh tokens pisados).
- **Costo**: S. **Propuesta**: un único cliente compartido. **→ Resuelto en Fase 1.**

### A2. URL del proyecto Supabase hardcodeada en el build
- `vite.config.js` (patrones de cache de Workbox) e `index.html` (preconnect) fijan
  `urqgygbejabyukzdjdal.supabase.co`. Cambiar de proyecto (staging/prod) rompe el
  cache offline silenciosamente.
- **Costo**: S. **Propuesta**: patrones genéricos `*.supabase.co`. **→ Fase 1.**

### A3. Sin headers de seguridad ni CSP en el despliegue
- `vercel.json` solo tiene el rewrite de SPA. Sin `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, HSTS ni CSP.
- **Costo**: S. **Propuesta**: bloque `headers` en `vercel.json` con CSP compatible
  con la app (estilos inline de React, Supabase, Google Fonts). **→ Fase 1.**

### A4. Política UPDATE de `invoices` sin `WITH CHECK`
- Con solo `USING`, un usuario no puede editar filas ajenas, pero sí puede **cambiar
  el `user_id` de una fila propia a otro usuario** (escritura "hacia" otra cuenta,
  contaminando sus datos).
- **Costo**: S. **Propuesta**: `WITH CHECK (auth.uid() = user_id)` en la nueva
  migración. **→ Fase 1.**

### A5. `user_id` acepta NULL en `invoices`
- El `SET NOT NULL` quedó comentado en la migración. Filas con `user_id` NULL se
  vuelven invisibles bajo RLS (parecen "perdidas").
- **Costo**: S. **Propuesta**: documentar el paso de backfill + `SET NOT NULL` en
  `docs/MIGRACIONES.md` como paso manual verificado (no automatizable sin conocer el
  estado de los datos productivos). **→ Fase 1 (documentado).**

### A6. Borrado inconsistente y huérfanos en storage
- `supabaseProvider.clearAll()` borra invoices pero no imágenes; `delete()` localiza
  la imagen con `list('', { search: id })` (frágil y hoy busca en raíz).
- **Costo**: M. **Propuesta**: rutas determinísticas por usuario (C3) eliminan el
  `search`; limpieza de huérfanos y retención quedan para Fase 3. **→ Parcial en Fase 1.**

### A7. Bug real en `backupService.importBackup`
- En el `catch` final se referencia `results`, declarado dentro del `try` →
  `ReferenceError` que enmascara el error original al usuario.
- **Costo**: S. **→ Resuelto en Fase 1.**

---

## 🟡 Medios

- **M1. Datos de ejemplo se siembran como datos reales**: `loadInvoices()` inicializa
  IndexedDB con `SAMPLE_INVOICES` si está vacía — un cliente nuevo ve boletas falsas
  mezclables con las suyas. Propuesta: sembrar solo en modo demo explícito (Fase 2/3).
- **M2. Políticas `FOR ALL` de mappings/templates sin `DROP POLICY IF EXISTS`**: la
  migración canónica no es re-ejecutable. Resuelto de paso en la migración nueva (Fase 1).
- **M3. Sección F29**: decisión de producto — se elimina en Fase 1 según especificación.
- **M4. Sin observabilidad**: no hay logs estructurados, request_id ni métricas.
  El endpoint nuevo de IA ya registra consumo por usuario en `usage_events` (base para
  facturación); logging estructurado completo va en Fase 2.
- **M5. UX de errores basada en `alert()`/`window.confirm()`**: funcional pero no
  vendible; rediseño en Fase 3 con el estándar de la sección 12.
- **M6. `package.json` name "my-app" v0.0.0**: renombrar a `declarix` (Fase 1, trivial).
- **M7. Validación solo en cliente**: los datos que valida `validateExtractedData`
  pueden insertarse igual vía API con el anon key. Mitigación estructural: RLS correcto
  (Fase 1) + `CHECK` constraints de montos/fechas en BD (Fase 2).
- **M8. Sin multi-organización ni RBAC**: modelo actual es por `user_id` directo.
  Diseño `organizations`/`organization_members` va en Fase 2 (las políticas nuevas se
  escriben de forma que migrar a membresía sea un reemplazo de predicado).
- **M9. Sin límites de plan**: tabla `plans` y enforcement van en Fase 2; `usage_events`
  (Fase 1) deja lista la medición.

## 🟢 Bajos

- Íconos emoji en UI (📋 🤖 💾) — reemplazar por iconografía consistente en Fase 3.
- Estilos inline extensos en páginas (ReportsPage ~1100 líneas) — extraer a CSS/design
  system en Fase 3.
- `console.log` con datos de negocio en producción — limpiar con el logging de Fase 2.
- Accesibilidad: buen uso de `aria-label` en navegación, pero modales sin focus-trap.
- PWA cachea `/rest/v1/*` con `NetworkFirst` 24 h: revisar invalidación tras mutaciones
  (Fase 3, junto con performance).

---

## Estado de cobertura de tests (base existente)

Tests presentes: `rutValidator`, `calculations`, `formatters`, `invoiceStore` (Vitest).
Faltan (prioridad según sección 11 de la especificación): RLS con dos usuarios
(checklist manual documentado en `docs/SECURITY.md`, Fase 1), extracción IA con
proveedor mockeado (Fase 2), exportación Excel con plantilla (Fase 2), sync
Dexie↔Supabase (Fase 2), E2E Playwright (Fase 4).

## Resumen del plan por fases

- **Fase 1 (este ciclo)**: C1–C5, A1–A5, A7, M2, M3, M6 + documentación de seguridad
  y migraciones. Todo lo que bloquea venta.
- **Fase 2**: organizaciones + RBAC, tabla `plans` con límites, observabilidad
  estructurada, tests de auth/IA/export/sync, constraints en BD.
- **Fase 3**: rediseño UX/UI + modo claro, performance, compresión/miniaturas/URLs
  firmadas, limpieza de huérfanos, retención.
- **Fase 4**: E2E completo, auditoría de seguridad exhaustiva, refinamiento de planes.
