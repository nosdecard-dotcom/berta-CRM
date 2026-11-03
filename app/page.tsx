import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();

  if (error || !claims) redirect("/login");

  const metadata = (claims.app_metadata ?? {}) as { role?: string };
  if (["admin", "manager", "agent"].includes(metadata.role ?? "")) {
    redirect("/conversations");
  }

  return (
    <main className="home-shell">
      <section className="welcome-card">
        <div className="brand-mark">B</div>
        <p className="eyebrow">MARZOE · BERTA AI CRM</p>
        <h2>Tu cuenta necesita configuración</h2>
        <p>La sesión está autenticada, pero todavía no tiene un rol operativo asignado.</p>
        <p className="setup-notice">Solicita al administrador que configure tu rol en <code>app_metadata.role</code> como <code>admin</code>, <code>manager</code> o <code>agent</code>.</p>
        <form action="/auth/signout" method="post"><button className="signout-button" type="submit">Cerrar sesión</button></form>
      </section>
    </main>
  );
}
