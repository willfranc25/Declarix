# Emails transaccionales con marca Declarix

Los correos de Supabase (confirmación, magic link, reset de contraseña) salen
con la plantilla genérica de Supabase. Personalizarlos toma ~15 minutos.

## Dónde se cambia

Dashboard de Supabase → **Authentication → Emails** (Email Templates).
Pegar el HTML correspondiente en cada plantilla y guardar.

Variables disponibles: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`.

> Además, en **Authentication → URL Configuration** verifica que `Site URL`
> sea la URL de producción y agrega `https://<dominio>/reset-password` a
> **Redirect URLs** (necesario para el flujo de reset implementado en la app).

## Base común (envoltorio)

Cada plantilla usa este envoltorio; cambia solo el bloque del medio.

```html
<div style="background:#f8fafc;padding:32px 16px;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
      <div style="width:28px;height:28px;background:#2563eb;border-radius:8px;color:#fff;
                  text-align:center;line-height:28px;font-weight:700;font-size:14px;">D</div>
      <strong style="font-size:16px;color:#0f172a;">Declarix</strong>
    </div>
    <!-- CONTENIDO -->
    <p style="margin-top:32px;font-size:12px;color:#94a3b8;">
      Si no solicitaste este correo, puedes ignorarlo.
      — Declarix · soporte@declarix.cl
    </p>
  </div>
</div>
```

## 1. Confirm signup (Confirmación de cuenta)

Asunto sugerido: `Confirma tu cuenta en Declarix`

```html
<h2 style="color:#0f172a;font-size:18px;margin:0 0 8px;">Bienvenido a Declarix</h2>
<p style="color:#475569;font-size:14px;line-height:1.7;">
  Estás a un clic de dejar de digitar boletas. Confirma tu correo para activar tu cuenta.
</p>
<a href="{{ .ConfirmationURL }}"
   style="display:inline-block;margin:16px 0;background:#2563eb;color:#fff;text-decoration:none;
          padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
  Confirmar mi cuenta
</a>
```

## 2. Magic Link (Enlace de acceso)

Asunto sugerido: `Tu enlace de acceso a Declarix`

```html
<h2 style="color:#0f172a;font-size:18px;margin:0 0 8px;">Entra a Declarix</h2>
<p style="color:#475569;font-size:14px;line-height:1.7;">
  Usa este enlace para iniciar sesión sin contraseña. Expira en 1 hora.
</p>
<a href="{{ .ConfirmationURL }}"
   style="display:inline-block;margin:16px 0;background:#2563eb;color:#fff;text-decoration:none;
          padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
  Iniciar sesión
</a>
```

## 3. Reset Password (Restablecer contraseña)

Asunto sugerido: `Restablece tu contraseña de Declarix`

```html
<h2 style="color:#0f172a;font-size:18px;margin:0 0 8px;">Restablecer contraseña</h2>
<p style="color:#475569;font-size:14px;line-height:1.7;">
  Pediste restablecer tu contraseña. Este enlace te lleva a definir una nueva; expira en 1 hora.
</p>
<a href="{{ .ConfirmationURL }}"
   style="display:inline-block;margin:16px 0;background:#2563eb;color:#fff;text-decoration:none;
          padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
  Definir contraseña nueva
</a>
```

## Remitente propio (cuando exista dominio)

Por defecto los correos salen de `noreply@mail.app.supabase.io` con límites de
envío bajos. Con el dominio propio:

1. Contratar el dominio (p. ej. `declarix.cl` en NIC Chile, ~$10.000 CLP/año).
2. En Vercel → Domains, agregar el dominio a la app.
3. Para el correo: configurar **Custom SMTP** en Supabase (Authentication →
   SMTP) con un proveedor como Resend (gratis hasta 3.000 correos/mes):
   remitente `soporte@declarix.cl`, y verificar el dominio (registros SPF/DKIM
   que Resend indica).
4. Crear el buzón/redirección `soporte@declarix.cl` (Cloudflare Email Routing
   es gratis) para recibir las respuestas de clientes.
