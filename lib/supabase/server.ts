import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el SERVIDOR (API routes, crons).
 * Usa la service_role key: ignora RLS y tiene acceso total.
 * NUNCA importar este archivo desde un componente de cliente ("use client").
 */
export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
