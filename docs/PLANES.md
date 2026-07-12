# Modelo de suscripción: plan único

Decisión de producto (2026-07-12): Declarix se vende con **una sola
suscripción que da acceso a todo, sin límites de uso**. Se abandonó el modelo
de tiers (Gratis/Independiente/Pyme/Contador) para eliminar fricción de venta
y de soporte.

## Cómo está implementado

- La tabla `plans` se conserva como infraestructura, pero operacionalmente
  existe un solo plan activo: **`pro` ("Suscripción Declarix")** con todos los
  límites en `NULL` (= ilimitado). Precio referencial: **$14.990 CLP/mes**.
- Las cuentas nuevas nacen directamente en `pro` (trigger `handle_new_user`,
  migración `20260712000001_single_plan.sql`).
- Las organizaciones existentes fueron migradas a `pro`.
- Los planes antiguos quedan como filas históricas sin uso.

## Cambiar el precio

Dos lugares (mantener sincronizados):

1. BD: `UPDATE public.plans SET price_clp = <nuevo> WHERE id = 'pro';`
2. Landing: constante `PLAN` en `src/pages/LandingPage.jsx`.

## Protecciones que SÍ siguen activas (no son límites de plan)

- **Límite de ráfaga de IA** (`AI_BURST_LIMIT`, 10/min por usuario) en
  `/api/extract`: protege la cuenta de Gemini de un loop descontrolado, no es
  un límite comercial.
- **Respaldo por usuario sin organización** (`AI_MONTHLY_LIMIT`, default 300):
  solo aplica a cuentas legacy sin organización; con el plan `pro` el límite
  mensual es NULL y no se aplica.

## Cobro

Manual mientras no exista pago en línea: el cliente crea su cuenta gratis,
prueba con boletas reales y activa la suscripción por contacto
(soporte@declarix.cl). Cuando haya volumen, integrar Flow/Transbank/Mercado
Pago (recordar presupuesto total del proyecto: US$20/mes).

## Roles por organización (RBAC) — sin cambios

| Rol | Ver datos | Cargar | Editar | Borrar | Exportar | Miembros | Suscripción |
|---|---|---|---|---|---|---|---|
| `owner` | todos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | todos | ✓ | ✓ | ✓ | ✓ | ✓ (no owners) | ✗ |
| `contador` | todos | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `colaborador` | solo los propios | ✓ | solo los propios | solo los propios | ✗ | ✗ | ✗ |
| `lector` | todos | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

El enforcement vive en las políticas RLS (migración `20260705000002`).
