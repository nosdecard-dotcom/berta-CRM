import type { SupabaseClient } from "@supabase/supabase-js";

type CustomerInput = {
  phone: string;
  name: string | null;
  source?: string;
};

export async function getOrCreateCustomer(
  supabase: SupabaseClient,
  input: CustomerInput
) {
  const { data: existing, error: lookupError } = await supabase
    .from("customers")
    .select("id, full_name, phone")
    .eq("phone", input.phone)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) {
    if (!existing.full_name && input.name) {
      const { error } = await supabase
        .from("customers")
        .update({ full_name: input.name, last_contact_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("customers")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      phone: input.phone,
      full_name: input.name,
      source: input.source ?? "whatsapp",
      last_contact_at: new Date().toISOString(),
    })
    .select("id, full_name, phone")
    .single();

  if (error) throw error;
  return created;
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  customerId: string,
  whatsappContactId: string | null,
  whatsappPhoneNumberId: string | null
) {
  const { data: existing, error: lookupError } = await supabase
    .from("conversations")
    .select("id, ai_enabled, status")
    .eq("customer_id", customerId)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerId,
      channel: "whatsapp",
      status: "open",
      whatsapp_contact_id: whatsappContactId,
      whatsapp_phone_number_id: whatsappPhoneNumberId,
      ai_enabled: true,
    })
    .select("id, ai_enabled, status")
    .single();

  if (error) throw error;
  return created;
}

export function isBotEnabledForConversation(conversation: {
  ai_enabled?: boolean;
  status?: string;
}) {
  return conversation.ai_enabled !== false && conversation.status !== "closed";
}
