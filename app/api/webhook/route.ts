import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getOrCreateCustomer,
  getOrCreateConversation,
  isBotEnabledForConversation,
} from "@/lib/contacts";
import { saveMessage, updateMessageStatus } from "@/lib/messages";
import { generateBertaReply, shouldEscalateToHuman } from "@/lib/agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";

type WhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  button?: { text?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  referral?: { source_type?: string };
  [key: string]: unknown;
};

function isValidMetaSignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signature?.startsWith("sha256=")) return false;

  const received = signature.slice("sha256=".length);
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);
}

function normalizeMessage(message: WhatsAppMessage) {
  const allowedTypes = [
    "text", "image", "audio", "video", "document",
    "location", "template", "interactive",
  ];
  const messageType = allowedTypes.includes(message.type ?? "")
    ? message.type as
        | "text" | "image" | "audio" | "video" | "document"
        | "location" | "template" | "interactive"
    : "unknown";

  let body: string | null = null;
  if (messageType === "text") body = message.text?.body?.trim() ?? null;
  else if (messageType === "image") body = message.image?.caption?.trim() || "[El cliente envió una imagen]";
  else if (messageType === "video") body = message.video?.caption?.trim() || "[El cliente envió un video]";
  else if (messageType === "document") {
    body = message.document?.caption?.trim() ||
      (message.document?.filename ? `[Documento: ${message.document.filename}]` : "[El cliente envió un documento]");
  } else if (messageType === "interactive") {
    body = message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      "[El cliente respondió a un mensaje interactivo]";
  } else if (messageType === "location") {
    const location = message.location;
    body = location
      ? `[Ubicación compartida: ${location.name ?? ""} ${location.address ?? ""} (${location.latitude ?? ""}, ${location.longitude ?? ""})]`.trim()
      : "[El cliente compartió una ubicación]";
  } else if (messageType === "audio") body = "[El cliente envió un audio]";
  else if (messageType === "template") body = "[El cliente envió una plantilla]";
  else body = "[El cliente envió un tipo de mensaje no compatible]";

  return { messageType, body };
}

async function processWebhookValue(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  value: any
) {
  // Primero actualizamos los estados de mensajes salientes.
  for (const status of value.statuses ?? []) {
    if (status.id && status.status) {
      await updateMessageStatus(supabase, status.id, status.status);
    }
  }

  for (const message of (value.messages ?? []) as WhatsAppMessage[]) {
    const phone = message.from;
    if (!phone || !message.id) continue;

    const contact = (value.contacts ?? []).find(
      (item: any) => item.wa_id === phone
    );
    const profileName = contact?.profile?.name ?? null;

    const customer = await getOrCreateCustomer(supabase, {
      phone,
      name: profileName,
      source: message.referral?.source_type === "ad" ? "whatsapp_ads" : "whatsapp",
    });

    const conversation = await getOrCreateConversation(
      supabase,
      customer.id,
      phone,
      value.metadata?.phone_number_id ?? null
    );

    const normalized = normalizeMessage(message);
    const saved = await saveMessage(supabase, {
      conversationId: conversation.id,
      direction: "inbound",
      body: normalized.body,
      messageType: normalized.messageType as import("@/lib/messages").MessageType,
      whatsappMessageId: message.id,
      deliveryStatus: "received",
      rawPayload: message,
    });

    // La restricción única evita reprocesar reintentos de Meta.
    if (!saved.inserted) continue;

    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (conversationUpdateError) throw conversationUpdateError;

    if (!isBotEnabledForConversation(conversation)) continue;

    if (shouldEscalateToHuman(normalized.body ?? "")) {
      const { error } = await supabase
        .from("conversations")
        .update({ ai_enabled: false, status: "pending" })
        .eq("id", conversation.id);
      if (error) throw error;

      const handoffText =
        "Entiendo tu consulta y lamento el inconveniente. Voy a derivarte con una persona de nuestro equipo para que pueda ayudarte.";
      const sent = await sendWhatsAppMessage(phone, handoffText);
      await saveMessage(supabase, {
        conversationId: conversation.id,
        direction: "outbound",
        body: handoffText,
        whatsappMessageId: sent.messages?.[0]?.id ?? null,
        deliveryStatus: "sent",
        aiGenerated: true,
      });
      continue;
    }

    const { data: history, error: historyError } = await supabase
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (historyError) throw historyError;

    const chatHistory = (history ?? [])
      .reverse()
      .filter((item) => item.body)
      .map((item) => ({
        role: item.direction === "inbound" ? "user" as const : "assistant" as const,
        content: item.body as string,
      }));

    const reply = await generateBertaReply({
      history: chatHistory,
      userMessage: normalized.body ?? "El cliente envió un mensaje sin texto.",
    });

    const sent = await sendWhatsAppMessage(phone, reply);
    await saveMessage(supabase, {
      conversationId: conversation.id,
      direction: "outbound",
      body: reply,
      whatsappMessageId: sent.messages?.[0]?.id ?? null,
      deliveryStatus: "sent",
      aiGenerated: true,
    });

    const { error: lastMessageError } = await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (lastMessageError) throw lastMessageError;
  }
}

/** Verificación del endpoint al registrarlo en Meta. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (verifyToken && mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Recibe todos los eventos incluidos en los paquetes enviados por WhatsApp. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma de webhook inválida." }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages" || !change.value) continue;
        await processWebhookValue(supabase, change.value);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error procesando webhook de WhatsApp:", error);
    // Un error transitorio debe provocar reintento de Meta; los mensajes
    // entrantes ya insertados se protegen con whatsapp_message_id único.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
