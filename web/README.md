# NitroFlow Web

Landing y plataforma web para NitroFlow con:

- Next.js (Vercel)
- Supabase (DB + Google OAuth)
- Stripe (checkout + webhook)
- NVIDIA NIM API (tickets IA)

## 1. Instalacion

```bash
cd web
npm install
cp .env.example .env.local
```

## 2. Variables de entorno

Completa `.env.local`:

- `NEXT_PUBLIC_APP_URL` (ej: <http://localhost:3000>)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_MODEL` (por defecto `z-ai/glm-5.1`)
- `GOOGLE_CLIENT_ID`

## 3. Supabase

1. Ejecuta `supabase/schema.sql` en el SQL editor.
2. En Authentication > Providers habilita **Google**.
3. Añade redirect URL:
   - `http://localhost:3000/api/auth/callback`
   - `https://tu-dominio.com/api/auth/callback`
4. Asigna rol admin en `profiles` para usuarios administradores.

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
- Verificacion licencia desktop: `/api/verify-license`

## 6. Flujo de licencia desktop

La app desktop debe:

1. Hacer login Google.
2. Enviar `googleToken` a `/api/verify-license`.
3. Leer respuesta:

```json
{ "licensed": true }
```

Si es `false`, bloquear acceso Pro.

## 7. NVIDIA NIM

La integracion de tickets IA usa:

- `base_url`: `https://integrate.api.nvidia.com/v1`
- `model`: `z-ai/glm-5.1`
- `temperature=1`, `top_p=1`, `max_tokens=16384`
- `extra_body.chat_template_kwargs.enable_thinking=true`
- `extra_body.chat_template_kwargs.clear_thinking=false`

Implementado en `src/lib/nim.ts`.

## 8. Ejecutar

```bash
npm run dev
```

Deploy recomendado: Vercel (root directory = `web`).
