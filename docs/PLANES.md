# Planes y monetización

## Modelo

Los límites viven en la tabla `plans` (BD), **no en el código**. Cambiar un
límite o precio es un `UPDATE` con service role — sin deploy. `NULL` en
cualquier columna de límite significa ilimitado.

| Columna | Recurso |
|---|---|
| `max_users` | Usuarios por organización (trigger `enforce_member_limit`) |
| `max_ai_calls_month` | Extracciones IA/mes (lo aplica `/api/extract`) |
| `max_documents_month` | Documentos/mes |
| `max_storage_mb` | Almacenamiento |
| `max_exports_month` | Exportaciones/mes |
| `history_months` | Historial retenido |

## Planes sembrados (punto de partida, ajustables por UPDATE)

| Plan | Precio CLP/mes | Usuarios | Docs/mes | IA/mes | Storage | Export/mes | Historial |
|---|---|---|---|---|---|---|---|
| Gratis | 0 | 1 | 30 | 30 | 250 MB | 5 | 6 meses |
| Independiente | 9.900 | 1 | 200 | 200 | 2 GB | 50 | 24 meses |
| Pyme | 19.900 | 5 | 600 | 600 | 5 GB | ∞ | ∞ |
| Contador | 39.900 | ∞ | ∞ | ∞ | 20 GB | ∞ | ∞ |

## Estado de enforcement

- **Aplicado hoy**: `max_users` (trigger en BD al agregar miembros) y
  `max_ai_calls_month` (en `/api/extract`, contando `usage_events` por
  organización). El resto de límites tiene la medición lista (`usage_events`)
  pero el enforcement queda para cuando exista checkout/facturación.
- **Cobro**: no hay integración de pagos todavía. El plan de una organización
  se cambia manualmente (`UPDATE organizations SET plan_id = 'pyme' WHERE ...`
  con service role). Integrar Flow/Transbank/MercadoPago es el paso natural
  cuando haya primer cliente dispuesto a pagar.

## Roles por organización (RBAC)

| Rol | Ver datos | Cargar | Editar | Borrar | Exportar | Miembros | Plan/Facturación |
|---|---|---|---|---|---|---|---|
| `owner` | todos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | todos | ✓ | ✓ | ✓ | ✓ | ✓ (no owners) | ✗ |
| `contador` | todos | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `colaborador` | solo los propios | ✓ | solo los propios | solo los propios | ✗ | ✗ | ✗ |
| `lector` | todos | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

El enforcement de esta matriz está en las políticas RLS de la migración
`20260705000002` — el frontend puede ocultar botones, pero la BD es quien
manda.

Cada usuario nuevo obtiene automáticamente una organización personal en plan
`free` (trigger `on_auth_user_created`). El plan Contador está pensado para
que un contador cree/administre varias organizaciones cliente.
