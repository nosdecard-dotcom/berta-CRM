import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "template"
  | "interactive"
  | "unknown";

type SaveMessageInput = {
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  messageType?: MessageType;
  whatsappMessageId?: string | null;
  deliveryStatus?: "received" | "queued" | "sent" | "delivered" | "read" | "failed";
  aiGenerated?: boolean;
  rawPayload?: unknown;
};

export async function saveMessage(
  supabase: SupabaseClient,
  input: SaveMessageInput
) {
  const row = {
    conversation_id: input.conversationId,
    direction: input.direction,
    message_type: input.messageType ?? "text",
    body: input.body,
    whatsapp_message_id: input.whatsappMessageId ?? null,
    delivery_status:
      input.deliveryStatus ??
      (input.direction === "inbound" ? "received" : "queued"),
    ai_generated: input.aiGenerated ?? false,
    raw_payload: input.rawPayload ?? null,
  };

  if (input.whatsappMessageId) {
    const { data, error } = await supabase
      .from("messages")
      .upsert(row, {
        onConflict: "whatsapp_message_id",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return { inserted: Boolean(data), id: data?.id ?? null };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return { inserted: true, id: data.id };
}

export async function updateMessageStatus(
  supabase: SupabaseClient,
  whatsappMessageId: string,
  status: string
) {
  const validStatuses = ["sent", "delivered", "read", "failed"];
  if (!validStatuses.includes(status)) return;

  const { error } = await supabase
    .from("messages")
    .update({ delivery_status: status })
    .eq("whatsapp_message_id", whatsappMessageId);

  if (error) throw error;
}
