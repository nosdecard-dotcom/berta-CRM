import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveIncomingMessage(
  supabase: SupabaseClient,
  contactId: string,
  role: "user" | "assistant",
  content: string
) {
  const { error } = await supabase.from("messages").insert({
    contact_id: contactId,
    role,
    content,
  });
  if (error) throw error;
}

/**
 * Actualiza el status de un mensaje saliente (sent -> delivered -> read),
 * matcheando por el whatsapp_message_id (wamid) que devuelve Meta.
 */
export async function updateMessageStatus(
  supabase: SupabaseClient,
  wamid: string,
  status: string
) {
  const validStatuses = ["sent", "delivered", "read", "failed"];
  if (!validStatuses.includes(status)) return;

  const { error } = await supabase
    .from("messages")
    .update({ status })
    .eq("whatsapp_message_id", wamid);

  if (error) console.error("Error actualizando status de mensaje:", error);
}
