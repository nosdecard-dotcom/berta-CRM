# BERTA AI CRM — MARZOE

CRM de atención y ventas por WhatsApp para MARZOE, tienda virtual de productos profesionales Wella en Cochabamba, Bolivia.

## Stack

- Next.js 16 / React 19
- Supabase Auth + PostgreSQL
- WhatsApp Cloud API (Meta)
- OpenRouter para el agente Berta

## Configuración de variables

Usar `.env.example` como plantilla para desarrollo local y cargar los valores correspondientes en Vercel.

Variables requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase Whatsapp Marzoe.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave pública publishable; las políticas RLS protegen los datos.
- `SUPABASE_SECRET_KEY`: clave secreta del servidor. También se admite `SUPABASE_SERVICE_ROLE_KEY` por compatibilidad. Nunca usar prefijo `NEXT_PUBLIC_`, incluirla en el navegador o subirla a GitHub.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del número de WhatsApp Business.
- `WHATSAPP_ACCESS_TOKEN`: token de acceso de WhatsApp Cloud API.
- `WHATSAPP_VERIFY_TOKEN`: token definido para la verificación GET del webhook.
- `WHATSAPP_APP_SECRET`: App Secret de Meta para validar `X-Hub-Signature-256`.
- `OPENROUTER_API_KEY`: clave del proveedor del modelo de IA.
- `NEXT_PUBLIC_APP_URL`: URL pública de la aplicación (opcional).

No guardar valores reales de credenciales en el repositorio.

## Webhook de WhatsApp

Configurar en Meta Developers:

- URL: `https://TU-DOMINIO/api/webhook`
- Token de verificación: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
- Suscripción al campo `messages`.

El endpoint valida la firma HMAC SHA-256 de Meta en cada POST. Por tanto, `WHATSAPP_APP_SECRET` debe estar configurado antes de activar el webhook.

## Datos y comportamiento de Berta

La integración usa las tablas existentes del proyecto Supabase seleccionado:

- `customers`: clientes identificados por número de teléfono.
- `conversations`: conversaciones de WhatsApp y estado de atención.
- `messages`: mensajes entrantes/salientes y estados de entrega.
- `profiles`: perfiles y roles del equipo.

No se crean tablas paralelas de contactos o leads. El agente está configurado para MARZOE, habla en español boliviano, conoce el catálogo de WhatsApp y la cobertura nacional de envíos, y no debe inventar precios ni stock.

Cuando se detecta una solicitud explícita de atención humana o un reclamo, la conversación pasa a estado `pending` y se desactiva `ai_enabled` para evitar que Berta siga respondiendo hasta que el equipo retome la atención.

## Desarrollo

```bash
npm install
npm run dev
```

## Estado del proyecto

La autenticación SSR y la integración inicial del webhook están en implementación. El panel CRM completo, la asignación operativa de agentes, el inventario/catálogo sincronizado y los reportes todavía requieren desarrollo y pruebas antes de producción.
