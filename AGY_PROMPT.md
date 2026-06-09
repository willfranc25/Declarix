Eres un agente de codificación trabajando en el repositorio /home/william/Declarix.

## Tech Stack
- React 19 + TypeScript + Vite
- React Router DOM v7
- Zustand (estado) + IndexedDB/Dexie + Supabase
- CSS personalizado con design system dark (index.css)

## Contexto del proyecto
App chilena de gestión de boletas para declaración F29/Saludent. Usuarios: contadora (hermana del dev) en móvil + PC. PWA offline-first.

## Archivos clave
- src/pages/LoginPage.jsx - Página de login/registro
- src/App.jsx - Routing principal
- src/components/Layout/AppLayout.jsx - Layout con Sidebar
- src/components/Layout/Sidebar.jsx - Navegación con NavLink
- src/index.css - Design system completo (variables, componentes, layout)

## Tareas

### 1. ARREGLAR ROUTING (crítico)
En App.jsx, las rutas anidadas dentro de AppLayout usan paths **absolutos** (/reports, /upload, etc.) pero deben ser **relativos** porque están dentro de un Route padre con path="/".

**Cambiar en App.jsx líneas 98-104:**
```jsx
<Route path="/" element={<DashboardPage />} />
<Route path="upload" element={<UploadPage />} />
<Route path="batch-review" element={<BatchReviewPage />} />
<Route path="invoices" element={<InvoicesPage />} />
<Route path="invoices/:id" element={<InvoiceDetailPage />} />
<Route path="reports" element={<ReportsPage />} />
<Route path="settings" element={<SettingsPage />} />
```

### 2. MEJORAR LOGIN PAGE (LoginPage.jsx)
**Problemas actuales:**
- Card se ve "expandida" (max-w-md = 448px muy ancho para formulario simple)
- Tabs login/registro básicos, sin feedback visual rico
- Falta micro-interacciones y pulido visual

**Requisitos:**
- Reducir ancho máximo del card a ~380px (max-w-sm o ancho fijo)
- Rediseñar tabs con mejor UX: indicador animado, estado hover/focus/active claros
- Añadir transiciones suaves al cambiar modo (login ↔ registro)
- Mejorar jerarquía visual: logo más integrado, inputs con labels flotantes o mejor espaciado
- Botón principal con loading state más pulido
- Input de email compartido entre ambos modos (no resetear al cambiar)
- Mantener modo magic link funcional
- Usar variables CSS del design system (--color-*, --radius-*, --shadow-*, --transition-*)
- Responsive: se ve bien en móvil (320px+) y desktop

### 3. VERIFICAR
- Ejecutar `npm run build` para comprobar TypeScript/ESLint
- Verificar que el dev server sigue funcionando

## Restricciones
- NO tocar lógica de autenticación (useAuth, Supabase)
- NO cambiar estructura de rutas pública/protegida
- Solo CSS/JSX visual y fix de routing
- Español en todo el código/UI
- Mantener accesibilidad (aria-*, roles, focus visible)

Ejecuta las tareas y verifica con build antes de terminar.