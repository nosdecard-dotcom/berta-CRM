import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const role = (claims.app_metadata as { role?: string } | undefined)?.role;
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (!userId || !["admin", "manager", "agent"].includes(role ?? "")) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  let payload: { conversationId?: unknown; body?: unknown };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!conversationId || !text || text.length > 4096) {
    return NextResponse.json({ error: "Selecciona una conversación y escribe un mensaje de hasta 4.096 caracteres." }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase.from("conversations")
    .select("id,status,assigned_to,customer:customers!conversations_customer_id_fkey(phone)")
    .eq("id", conversationId).maybeSingle();
  if (conversationError || !conversation) return NextResponse.json({ error: "Conversación no encontrada o sin acceso." }, { status: 404 });
  if (conversation.status === "closed") return NextResponse.json({ error: "La conversación está cerrada." }, { status: 409 });
  if (role === "agent" && conversation.assigned_to !== userId) {
    return NextResponse.json({ error: "No tienes asignada esta conversación." }, { status: 403 });
  }

  const customer = conversation.customer as unknown as { phone: string } | null;
  if (!customer?.phone) return NextResponse.json({ error: "El cliente no tiene teléfono registrado." }, { status: 422 });

  const { data: lastInbound, error: historyError } = await supabase.from("messages")
    .select("created_at").eq("conversation_id", conversationId).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (historyError) return NextResponse.json({ error: "No se pudo validar la ventana de atención." }, { status: 500 });
  if (!lastInbound || Date.now() - new Date(lastInbound.created_at).getTime() >= WINDOW_MS) {
    return NextResponse.json({
      error: "La ventana de 24 horas terminó. Debes utilizar una plantilla de WhatsApp aprobada por Meta.",
      code: "WHATSAPP_TEMPLATE_REQUIRED",
    }, { status: 409 });
  }

  // El agente toma el control humano y Berta deja de responder en esta conversación.
  const { error: pauseError } = await supabase.from("conversations")
    .update({ ai_enabled: false, status: "pending" }).eq("id", conversationId);
  if (pauseError) return NextResponse.json({ error: "No se pudo tomar el control humano." }, { status: 500 });

  const { data: saved, error: saveError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    message_type: "text",
    body: text,
    delivery_status: "queued",
    ai_generated: false,
    sent_by: userId,
  }).select("id").single();
  if (saveError || !saved) return NextResponse.json({ error: "No se pudo registrar el mensaje." }, { status: 500 });

  try {
    const result = await sendWhatsAppMessage(customer.phone, text);
    const whatsappId = result.messages?.[0]?.id ?? null;
    const { error: updateError } = await supabase.from("messages")
      .update({ whatsapp_message_id: whatsappId, delivery_status: "sent" }).eq("id", saved.id);
    if (updateError) {
      console.error("WhatsApp aceptó el mensaje, pero falló la actualización del registro:", updateError);
      return NextResponse.json({ ok: true, warning: "WhatsApp aceptó el mensaje, pero el CRM no actualizó su registro." });
    }
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return NextResponse.json({ ok: true, messageId: saved.id });
  } catch (error) {
    console.error("Error al enviar respuesta humana:", error);
    await supabase.from("messages").update({ delivery_status: "failed" }).eq("id", saved.id);
    return NextResponse.json({ error: "No se pudo enviar. El mensaje quedó registrado como fallido." }, { status: 502 });
  }
}
