import { createClient } from "@supabase/supabase-js";

/**
 * Cliente privilegiado solo para rutas del servidor y webhooks.
 * La clave secreta nunca debe usarse en componentes cliente ni tener prefijo NEXT_PUBLIC_.
 */
export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en el servidor."
    );
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
