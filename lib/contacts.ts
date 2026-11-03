import type { SupabaseClient } from "@supabase/supabase-js";

type NewContactInput = {
  phone: string;
  name: string | null;
  ctwaClid: string | null;
  adSource: string | null;
};

export async function getOrCreateContact(
  supabase: SupabaseClient,
  input: NewContactInput
) {
  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone", input.phone)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      phone: input.phone,
      name: input.name,
      ctwa_clid: input.ctwaClid,
      ad_source: input.adSource,
    })
    .select("*")
    .single();

  if (error) throw error;
  return created;
}

export async function isBotEnabledForContact(contact: {
  bot_enabled?: boolean;
}) {
  // bot_enabled es true por default en el schema; si es explícitamente false, se respeta.
  return contact.bot_enabled !== false;
}
