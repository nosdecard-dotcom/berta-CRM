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

/** Meta verifica el endpoint al momento de registrar el webhook. */
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

/** Recibe mensajes y estados enviados por WhatsApp Cloud API. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // No aceptar eventos que no estén firmados por la aplicación de Meta.
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
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return NextResponse.json({ ok: true });

    const supabase = createServerSupabaseClient();

    // Confirmaciones de envío, entrega, lectura o fallo.
    for (const status of value.statuses ?? []) {
      if (status.id && status.status) {
        await updateMessageStatus(supabase, status.id, status.status);
      }
    }

    for (const message of value.messages ?? []) {
      const phone = message.from;
      if (!phone || !message.id) continue;

      const profileName = value.contacts?.[0]?.profile?.name ?? null;
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

      const isText = message.type === "text" && typeof message.text?.body === "string";
      const incomingText = isText
        ? message.text.body.trim()
        : `[El cliente envió un mensaje de tipo ${String(message.type ?? "desconocido")}]`;

      // El ID de WhatsApp es único: evita responder dos veces a reintentos de Meta.
      const saved = await saveMessage(supabase, {
        conversationId: conversation.id,
        direction: "inbound",
        body: incomingText,
        whatsappMessageId: message.id,
        deliveryStatus: "received",
        rawPayload: message,
      });
      if (!saved.inserted) continue;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      if (!isBotEnabledForConversation(conversation)) continue;

      // Solicitudes explícitas de persona o reclamos pasan a la bandeja humana.
      if (shouldEscalateToHuman(incomingText)) {
        await supabase
          .from("conversations")
          .update({ ai_enabled: false, status: "pending" })
          .eq("id", conversation.id);

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
        userMessage: incomingText,
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

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error procesando webhook de WhatsApp:", error);
    // Meta debe recibir una respuesta para no generar reintentos ilimitados.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
