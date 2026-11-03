# Berta CRM

CRM de WhatsApp con agente IA. Next.js + Supabase + WhatsApp Business API + OpenRouter (DeepSeek).

## Deploy en Vercel

No hay forma de desplegar esto de manera automática sin tu cuenta de Vercel y tus
credenciales — estos son los pasos para hacerlo vos, toma unos 5 minutos.

### 1. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Berta CRM: setup inicial + webhook"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/berta-crm.git
git push -u origin main
```

(Creá el repo vacío en GitHub primero, sin README, para que el push no choque.)

### 2. Importar el proyecto en Vercel

1. Andá a https://vercel.com/new
2. Elegí el repo `berta-crm` que acabás de subir
3. Framework: se detecta solo como Next.js. No cambies nada más.

### 3. Cargar las variables de entorno

Antes de hacer click en "Deploy", en la misma pantalla de importación (o después en
**Settings → Environment Variables**) cargá estas, con tus valores reales:

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=
```

Ver `.env.example` para la lista completa.

### 4. Deploy

Click en **Deploy**. Vercel te da una URL tipo `https://berta-crm-xxxx.vercel.app`.

### 5. Configurar el webhook en Meta Developers

Con la URL de Vercel ya andando:

1. Meta Developers → tu app → WhatsApp → Configuración → Webhook → Editar
2. URL: `https://tu-app.vercel.app/api/webhook`
3. Token de verificación: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
4. Verificar y guardar
5. Suscribirse a los campos: `messages`, `message_deliveries`, `message_reads`

### 6. Probar

Mandale un WhatsApp al número de prueba (o al real, si ya pasaste a producción) y
verificá que Berta responde. Podés ver los logs en tiempo real en Vercel →
tu proyecto → **Logs**, útil para debuggear si algo falla.

## Estructura

```
app/
  api/webhook/route.ts   → recibe mensajes y statuses de WhatsApp
  dashboard/              → panel de métricas (pendiente conectar a Supabase)
  conversations/           → panel de conversaciones (pendiente conectar)
  settings/                 → editor del system prompt (pendiente conectar)
  test-chat/                → probar respuestas sin WhatsApp real (pendiente conectar)
lib/
  agent.ts        → llamadas a OpenRouter/DeepSeek + reglas irrompibles
  whatsapp.ts      → envío de mensajes vía WhatsApp Cloud API
  contacts.ts       → crear/buscar contactos
  messages.ts        → guardar mensajes y actualizar status
  leads.ts             → calificación automática de leads (HOT/WARM/COLD)
  supabase/server.ts    → cliente con service_role (solo servidor)
  supabase/client.ts     → cliente con anon key (navegador)
```

## Pendiente

- Conectar las páginas del dashboard (hoy son mock/artifact) a datos reales de Supabase
- Crons de `/api/cron/notify` y `/api/cron/followup`
- Elegir un canal para avisos de leads HOT (se sacó Resend/email del proyecto)

## Autenticación inicial (Supabase Auth)

La aplicación usa autenticación SSR con cookies mediante `@supabase/ssr`. El inicio de sesión es por correo y contraseña; no hay registro público desde la pantalla de acceso.

### Variables de entorno

Configurar en Vercel y en `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave pública `anon` (solo para cliente público; las políticas RLS deben limitar el acceso).
- `SUPABASE_URL`: URL del proyecto, solo servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: clave secreta del servidor, necesaria para el webhook. Nunca debe llevar prefijo `NEXT_PUBLIC_`, ni aparecer en el navegador o repositorio.

### Crear la primera cuenta administradora

1. En Supabase Dashboard, abrir **Authentication → Users → Add user**.
2. Crear el usuario administrador con el correo corporativo y una contraseña segura. Desactivar la confirmación automática solo si la política interna así lo permite; preferiblemente confirmar el correo.
3. En el registro del usuario, editar `app_metadata` (metadatos administrados por el servidor) y establecer:

```json
{ "role": "admin" }
```

4. Guardar los cambios y volver a iniciar sesión para obtener un JWT actualizado.

No asignar roles desde `user_metadata`: ese campo puede ser modificado por el usuario y no debe usarse para autorización. La aplicación muestra el rol confiable de `app_metadata` como dato informativo.

### Importante sobre seguridad y alcance

- `proxy.ts` actualiza las cookies y redirige las páginas privadas a `/login` cuando no hay sesión válida.
- Las rutas `/api/*` quedan fuera del proxy de páginas: cada endpoint de API debe validar su propia autorización o secreto. El webhook de Meta debe permanecer público para la verificación de Meta y protegerse con su token de verificación y validación de firma del webhook antes de producción.
- El cliente administrativo de `lib/supabase/server.ts` sigue usando `SUPABASE_SERVICE_ROLE_KEY` únicamente en servidor para el webhook. No importarlo desde componentes cliente.
- Esta entrega implementa el acceso, no el RBAC completo ni la conexión de los módulos CRM. Las tablas y políticas RLS deben verificarse en el proyecto Supabase elegido antes de habilitar datos reales.
