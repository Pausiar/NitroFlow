# NitroFlow Web

Landing y plataforma web para NitroFlow con:

- Next.js (Vercel)
- Supabase (DB + Google OAuth)
- Stripe (checkout + webhook)
- Proveedor de IA server-side para tickets de soporte

## 1. Instalacion

```bash
cd web
npm install
cp .env.example .env.local
```

## 2. Variables de entorno

Completa `.env.local` y configura los mismos valores en Vercel:

- `NEXT_PUBLIC_APP_URL` (ej: `http://localhost:3000` en local o tu dominio publico en produccion)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `AI_PROVIDER_BASE_URL`
- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_MODEL`
- `GOOGLE_CLIENT_ID`

> Las variables legacy `NVIDIA_NIM_*` siguen soportadas como fallback privado de servidor para no romper despliegues existentes, pero no deben usarse en textos publicos.

## 3. Supabase

1. Ejecuta `supabase/schema.sql` en el SQL editor.
2. En Authentication > Providers habilita **Google**.
3. Añade redirect URL:
   - `http://localhost:3000/api/auth/callback`
   - `https://tu-dominio.com/api/auth/callback`
   - `https://web-tau-two-22.vercel.app/api/auth/callback` si ese sigue siendo el dominio publico activo.
4. Asigna rol admin en `profiles` para usuarios administradores.
5. Mantén RLS habilitado y usa la service role key solo en rutas server-side.

## 4. Stripe

1. Crea un Price para el plan Pro y copia su ID en `STRIPE_PRO_PRICE_ID`.
2. Configura webhook apuntando a `https://tu-dominio.com/api/stripe/webhook`.
3. Selecciona evento `checkout.session.completed`.
4. Copia signing secret en `STRIPE_WEBHOOK_SECRET`.

## 5. Rutas clave

- Landing: `/`
- Login Google: `/auth/login`
- Dashboard usuario: `/dashboard`
- Soporte/tickets: `/support`
- Admin: `/admin`
- Checkout API: `/api/stripe/checkout`
- Webhook Stripe: `/api/stripe/webhook`

## 6. Flujo de licencia desktop

La licencia se valida desde servidor. La web no debe documentar payloads reales, respuestas exactas, rutas consumibles ni reglas internas en superficies publicas. La app desktop solo debe recibir el resultado minimo necesario para habilitar o bloquear funciones Pro.

## 7. IA de soporte

La integracion de tickets IA se configura exclusivamente con variables de entorno server-side. No incluyas claves, modelos, endpoints del proveedor ni respuestas internas en paginas publicas.

Implementado en `src/lib/nim.ts`.

## 8. Ejecutar

```bash
npm run dev
```

Deploy recomendado: Vercel (root directory = `web`).
