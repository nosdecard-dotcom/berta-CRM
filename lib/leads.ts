import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLead } from "./agent";

/**
 * Se llama después de guardar la respuesta de Berta.
 * Solo califica si el contacto ya mandó 3+ mensajes (para no gastar
 * llamadas al modelo en conversaciones que recién arrancan).
 */
export async function maybeQualifyLead(
  supabase: SupabaseClient,
  contactId: string
) {
  const { data: userMessages, count } = await supabase
    .from("messages")
    .select("role", { count: "exact" })
    .eq("contact_id", contactId)
    .eq("role", "user");

  if (!count || count < 3) return;

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!history?.length) return;

  const { score, reason } = await classifyLead(
    history as { role: "user" | "assistant"; content: string }[]
  );

  // Sin canal de notificación externo (no se usa Resend): el lead HOT
  // queda calificado y visible al instante en /dashboard y /conversations.
  // `notified` queda en false a propósito, disponible por si más adelante
  // se agrega un canal (ej. mensaje a un grupo de WhatsApp interno, Slack, etc).
  const { error } = await supabase
    .from("leads")
    .insert({ contact_id: contactId, score, reason });

  if (error) throw error;
}
