import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const role = (claims.claims.app_metadata as { role?: string } | undefined)?.role;
  const userId = typeof claims.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId || !["admin", "manager", "agent"].includes(role ?? "")) {
    return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });
  }

  let payload: { conversationId?: unknown; action?: unknown; assignedTo?: unknown };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
  const action = payload.action;
  if (!conversationId || !["assign", "toggle_ai", "toggle_status"].includes(String(action))) {
    return NextResponse.json({ error: "Acción o conversación no válida." }, { status: 400 });
  }

  const { data: conversation, error: lookupError } = await supabase.from("conversations")
    .select("id,status,ai_enabled,assigned_to").eq("id", conversationId).maybeSingle();
  if (lookupError || !conversation) return NextResponse.json({ error: "Conversación no encontrada o sin acceso." }, { status: 404 });

  if (action === "assign") {
    if (!["admin", "manager"].includes(role ?? "")) return NextResponse.json({ error: "Solo administración o gerencia puede asignar conversaciones." }, { status: 403 });
    const assignedTo = payload.assignedTo === null ? null : typeof payload.assignedTo === "string" ? payload.assignedTo : undefined;
    if (assignedTo === undefined) return NextResponse.json({ error: "Selecciona un agente válido." }, { status: 400 });

    if (assignedTo) {
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("id,role,is_active").eq("id", assignedTo).maybeSingle();
      if (profileError || !profile || !profile.is_active || !["admin", "manager", "agent"].includes(profile.role)) {
        return NextResponse.json({ error: "El usuario seleccionado no está activo o no tiene un rol válido." }, { status: 422 });
      }
    }
    const { error: updateError } = await supabase.from("conversations")
      .update({ assigned_to: assignedTo, status: "pending", ai_enabled: false }).eq("id", conversationId);
    if (updateError) return NextResponse.json({ error: "No se pudo asignar la conversación. Verifica las políticas de acceso." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (role === "agent" && conversation.assigned_to !== userId) {
    return NextResponse.json({ error: "Solo puedes modificar conversaciones asignadas a tu usuario." }, { status: 403 });
  }

  const changes = action === "toggle_ai"
    ? { ai_enabled: !conversation.ai_enabled, status: conversation.status === "closed" ? "open" : conversation.status }
    : { status: conversation.status === "closed" ? "open" : "closed", ai_enabled: conversation.status === "closed" ? conversation.ai_enabled : false };

  const { error: updateError } = await supabase.from("conversations").update(changes).eq("id", conversationId);
  if (updateError) return NextResponse.json({ error: "No se pudo actualizar la conversación." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
