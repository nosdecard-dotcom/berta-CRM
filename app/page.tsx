import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { claims }, error } = await supabase.auth.getClaims();

  if (error || !claims) redirect("/login");

  const appMetadata = (claims.app_metadata ?? {}) as { role?: string };
  const role = appMetadata.role ?? "sin asignar";
  const email = typeof claims.email === "string" ? claims.email : "Usuario autenticado";

  return (
    <main className="home-shell">
      <header className="home-header">
        <div>
          <p className="eyebrow">MARZOE · ESPACIO DE TRABAJO</p>
          <h1>BERTA AI CRM</h1>
        </div>
        <form action="/auth/signout" method="post">
          <button className="signout-button" type="submit">Cerrar sesión</button>
        </form>
      </header>
      <section className="welcome-card">
        <div className="brand-mark">B</div>
        <p className="eyebrow">SESIÓN VERIFICADA</p>
        <h2>Bienvenido a BERTA AI CRM</h2>
        <p>La autenticación con Supabase está activa para esta sesión.</p>
        <dl className="account-details">
          <div><dt>Cuenta</dt><dd>{email}</dd></div>
          <div><dt>Rol asignado</dt><dd>{role}</dd></div>
        </dl>
        {role === "sin asignar" && (
          <p className="setup-notice">
            Tu cuenta inició sesión, pero aún no tiene un rol administrativo asignado en Supabase.
            Solicita que el administrador configure <code>app_metadata.role</code> como <code>admin</code>.
          </p>
        )}
        <p className="pending-note">El panel operativo, los contactos y las conversaciones se conectarán en la siguiente etapa.</p>
      </section>
    </main>
  );
}
