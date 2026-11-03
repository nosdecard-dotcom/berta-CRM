import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateContact, isBotEnabledForContact } from "@/lib/contacts";
import { saveIncomingMessage, updateMessageStatus } from "@/lib/messages";
import { generateBertaReply } from "@/lib/agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { maybeQualifyLead } from "@/lib/leads";

/**
 * GET: verificación del webhook (Meta la llama una sola vez al configurar).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST: eventos entrantes de WhatsApp.
 * Puede traer `messages` (mensaje nuevo) o `statuses` (sent/delivered/read/failed).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    // --- Caso 1: confirmaciones de estado (delivered/read/failed) ---
    if (change?.statuses?.length) {
      const supabase = createServerSupabaseClient();
      for (const status of change.statuses) {
        await updateMessageStatus(supabase, status.id, status.status);
      }
      return NextResponse.json({ ok: true });
    }

    // --- Caso 2: mensaje entrante ---
    const message = change?.messages?.[0];
    if (!message) {
      // Evento que no nos interesa (ej. template status). Igual respondemos 200.
      return NextResponse.json({ ok: true });
    }

    const from = message.from; // número del usuario
    const text = message.text?.body ?? "";
    const profileName = change?.contacts?.[0]?.profile?.name ?? null;
    const ctwaClid = message.referral?.ctwa_clid ?? null;
    const adSource = message.referral?.source_type ?? null;

    const supabase = createServerSupabaseClient();

    const contact = await getOrCreateContact(supabase, {
      phone: from,
      name: profileName,
      ctwaClid,
      adSource,
    });

    // Si está bloqueado o el bot está apagado para este contacto, solo guardamos y salimos.
    if (contact.blocked || !(await isBotEnabledForContact(contact))) {
      await saveIncomingMessage(supabase, contact.id, "user", text);
      return NextResponse.json({ ok: true });
    }

    await saveIncomingMessage(supabase, contact.id, "user", text);

    // Últimos 20 mensajes para darle contexto al agente
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const reply = await generateBertaReply({
      history: (history ?? []).reverse(),
      userMessage: text,
    });

    const sendResult = await sendWhatsAppMessage(from, reply);

    await supabase.from("messages").insert({
      contact_id: contact.id,
      role: "assistant",
      content: reply,
      whatsapp_message_id: sendResult?.messages?.[0]?.id ?? null,
      status: "sent",
    });

    // Calificación de lead en background (no bloquea la respuesta al usuario)
    maybeQualifyLead(supabase, contact.id).catch((err) =>
      console.error("Error calificando lead:", err)
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en webhook:", err);
    // Igual devolvemos 200 para que Meta no reintente en loop.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
