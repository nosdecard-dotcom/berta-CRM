import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

async function authorized() {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims) return { response: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };
  const role = (claims.claims.app_metadata as { role?: string } | undefined)?.role;
  if (!["admin", "manager", "agent"].includes(role ?? "")) return { response: NextResponse.json({ error: "Sin permisos." }, { status: 403 }) };
  return { supabase, role: role ?? "", userId: String(claims.claims.sub) };
}

function parse(body: Record<string, unknown>) {
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().replace(/[\s()-]/g, "") : "";
  if (!full_name || full_name.length > 120 || !/^\+?[1-9]\d{6,14}$/.test(phone)) throw new Error("Ingresa un nombre y un teléfono internacional válido (ej. +591XXXXXXXX).");
  const tags = Array.isArray(body.tags) ? body.tags.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 20) : [];
  if (typeof body.email === "string" && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new Error("Ingresa un correo válido.");
  if (typeof body.notes === "string" && body.notes.length > 2000) throw new Error("Las notas no pueden superar 2000 caracteres.");
  if (typeof body.source === "string" && !["whatsapp", "instagram", "facebook", "marketplace", "referido", "otro"].includes(body.source)) throw new Error("Procedencia no válida.");
  return { full_name, phone, email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null, city: typeof body.city === "string" && body.city.trim() ? body.city.trim() : null, notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null, source: typeof body.source === "string" ? body.source : "whatsapp", tags };
}

async function validateAssignee(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: unknown) {
  if (id === null || id === "" || id === undefined) return null;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Responsable inválido.");
  const { data, error } = await supabase.from("profiles").select("id").eq("id", id).eq("is_active", true).maybeSingle();
  if (error || !data) throw new Error("Selecciona un responsable activo y autorizado.");
  return id;
}

export async function POST(req: NextRequest) {
  const auth = await authorized(); if ("response" in auth) return auth.response;
  try {
    const body = await req.json(); const values = parse(body);
    const assigned_to = ["admin", "manager"].includes(auth.role) ? await validateAssignee(auth.supabase, body.assigned_to) : auth.userId;
    const { data, error } = await auth.supabase.from("customers").insert({ ...values, assigned_to, created_by: auth.userId }).select("id").single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Ya existe un cliente con ese teléfono." : "No se pudo registrar el cliente." }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos." }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorized(); if ("response" in auth) return auth.response;
  try {
    const body = await req.json(); const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Falta el identificador del cliente." }, { status: 400 });
    const values = parse(body);
    const update: Record<string, unknown> = { ...values };
    if (["admin", "manager"].includes(auth.role)) update.assigned_to = await validateAssignee(auth.supabase, body.assigned_to);
    const { data, error } = await auth.supabase.from("customers").update(update).eq("id", id).select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "No se pudo actualizar el cliente o no tienes acceso." }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos." }, { status: 400 }); }
}
