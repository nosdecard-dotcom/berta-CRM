import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export async function requireCrmWorkspace({ supervisorsOnly = false, adminOnly = false } = {}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");

  const { claims } = data;
  const userId = claims.sub;
  const role = (claims.app_metadata as { role?: string } | undefined)?.role;
  if (typeof userId !== "string" || !userId ||
      (role !== "admin" && role !== "manager" && role !== "agent")) redirect("/dashboard");
  if ((adminOnly && role !== "admin") || (supervisorsOnly && role === "agent")) redirect("/dashboard");

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,full_name,role,is_active").eq("id", userId).maybeSingle();
  if (profileError || !profile?.is_active || profile.role !== role) redirect("/dashboard");

  return { supabase, role, userId, name: profile.full_name, email: claims.email };
}
