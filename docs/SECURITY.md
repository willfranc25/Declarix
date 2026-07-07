# Seguridad — Declarix

## Modelo de aislamiento (estado actual, Fase 1)

- Cada tabla con datos de usuario (`invoices`, `mappings`, `templates`,
  `settings`, `usage_events`) tiene RLS habilitado con políticas
  `auth.uid() = user_id`, incluyendo `WITH CHECK` en escrituras (un usuario no
  puede crear/mover filas hacia otra cuenta).
- El bucket de storage `images` es privado; los objetos viven en
  `<user_id>/<invoiceId>.<ext>` y las políticas exigen que el primer segmento
  de la ruta sea el `auth.uid()` del solicitante.
- La API key del proveedor de IA vive solo en variables de entorno del
  servidor (`/api/extract`); el endpoint exige sesión, aplica límites de
  ráfaga y mensuales, y registra consumo en `usage_events`.
- **Organizaciones + RBAC (Fase 2 aplicada)**: las políticas ahora aceptan
  acceso por membresía de organización según rol (owner/admin/contador/
  colaborador/lector — matriz completa en `docs/PLANES.md`). Las filas legacy
  con `organization_id NULL` siguen el modelo por `user_id` directo. Los
  helpers `org_role()`/`is_org_member()` son SECURITY DEFINER para evitar
  recursión de RLS.

## Checklist de verificación RLS con dos usuarios (ejecutar tras cada cambio de políticas)

Preparación: crear `usuario_a@test.com` y `usuario_b@test.com` en
Authentication → Users. Iniciar sesión con cada uno en dos navegadores (o
ventana normal + incógnito). Con el Usuario A, crear al menos 1 comprobante
con imagen, 1 mapping y guardar un setting.

Con la sesión del **Usuario B** (usando la app y/o `curl` con el anon key +
access token de B):

| # | Prueba | Esperado |
|---|---|---|
| 1 | `GET /rest/v1/invoices?select=*` | Solo filas de B (0 si no tiene) |
| 2 | `GET /rest/v1/invoices?id=eq.<id de A>` | `[]` vacío |
| 3 | `PATCH /rest/v1/invoices?id=eq.<id de A>` con `{"detail":"hack"}` | 0 filas afectadas |
| 4 | `DELETE /rest/v1/invoices?id=eq.<id de A>` | 0 filas afectadas |
| 5 | `POST /rest/v1/invoices` con `user_id` = id de A | Error 42501 (WITH CHECK) |
| 6 | `PATCH` de una fila propia cambiando `user_id` al de A | Error 42501 (WITH CHECK) |
| 7 | Repetir 1–4 sobre `mappings`, `templates`, `settings` | Mismo resultado |
| 8 | `GET /rest/v1/settings?select=*` | B NO ve `vlm_api_key` ni settings de A |
| 9 | `GET /storage/v1/object/images/<uid_A>/<archivo>` con token de B | 400/403 |
| 10 | `POST /storage/v1/object/images/<uid_A>/x.jpg` con token de B | 400/403 |
| 11 | `GET /rest/v1/usage_events?select=*` | Solo eventos de B |
| 12 | `POST /rest/v1/usage_events` con anon key + token de B | Error (solo service role inserta) |

Con organizaciones (B **no** es miembro de la organización de A):

| # | Prueba | Esperado |
|---|---|---|
| 13 | `GET /rest/v1/organizations?select=*` con token de B | Solo la organización de B |
| 14 | `POST /rest/v1/organization_members` agregándose a la org de A | Error 42501 |
| 15 | Agregar a B como `lector` en la org de A (con token de A, owner) y repetir 3–4 | B lee pero no edita/borra |
| 16 | Con B `colaborador`: `GET invoices` de la org | B solo ve comprobantes con su `user_id` |
| 17 | Con org en plan `free` (1 usuario): agregar segundo miembro | Error "límite de usuarios" (trigger) |

Ejemplo de curl para la prueba 2:
```bash
curl "https://<PROYECTO>.supabase.co/rest/v1/invoices?id=eq.<ID_DE_A>" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN_DE_B>"
```

## Endpoint /api/extract

- Rechaza peticiones sin `Authorization: Bearer <access_token>` válido (401).
- Valida tipo MIME (solo imágenes) y tamaño (~4 MB máx).
- Límites por usuario: `AI_BURST_LIMIT`/minuto (default 10) y
  `AI_MONTHLY_LIMIT`/mes (default 300) — devuelve 429 con mensaje entendible.
- Nunca devuelve el cuerpo de error del proveedor de IA al cliente; los
  detalles quedan en los logs del servidor con `request_id`.

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Cliente (Vite) | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Cliente (Vite) | Anon key (pública por diseño; RLS protege los datos) |
| `SUPABASE_URL` | Servidor (Vercel) | URL del proyecto (para /api) |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor (Vercel) | **Secreta.** Nunca con prefijo VITE_, nunca en el repo |
| `VLM_PROVIDER` | Servidor | `gemini` (default) u `openai` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Servidor | Key del proveedor de IA |
| `AI_MONTHLY_LIMIT`, `AI_BURST_LIMIT` | Servidor | Límites de extracción por usuario |

## Headers y CSP

Definidos en `vercel.json`: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, HSTS, `Permissions-Policy` y una CSP que solo permite
conexiones a Supabase. El navegador ya no llama directo a OpenAI/Gemini
(la extracción pasa siempre por `/api/extract`), por lo que esos dominios
fueron retirados de `connect-src`.
Si se agrega un dominio externo nuevo (analytics, CDN), hay que sumarlo a la
CSP o el navegador lo bloqueará.

## Backups

Los ZIP de respaldo **no incluyen la API key de IA** (los backups se comparten
con contadores/terceros). Backups antiguos que la contenían se restauran sin
problema; la clave simplemente vuelve a guardarse como setting del usuario.
