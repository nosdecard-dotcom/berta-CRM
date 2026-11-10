import Link from "next/link";
import WorkspaceSection from "@/app/components/workspace-section";
import { requireCrmWorkspace } from "@/lib/crm-workspace";

export const dynamic = "force-dynamic";

const roleLabel = (role: string) => {
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Supervisor";
  if (role === "agent") return "Agente";
  return "Sin rol de CRM";
};

export default async function TeamPage() {
  const { supabase, role, name, email } = await requireCrmWorkspace();
  const staff = role === "agent" ? null : await supabase.from("profiles")
    .select("id,full_name,role,is_active").order("is_active", { ascending: false }).order("full_name");

  return (
    <WorkspaceSection role={role} title="Equipo y ajustes" description="Revisá tu cuenta y los accesos del equipo MARZOE.">
      <div className="dashboard-columns">
        <section className="dashboard-panel" aria-labelledby="account-title">
          <div className="dashboard-panel-heading"><div><h2 id="account-title">Mi cuenta</h2>
            <p>Datos y permisos de tu sesión</p></div></div>
          <div className="dashboard-activity">
            <dl className="berta-facts">
              <div><dt>Nombre</dt><dd>{name?.trim() || "Sin nombre registrado"}</dd></div>
              <div><dt>Correo electrónico</dt><dd>{email || "Sin correo registrado"}</dd></div>
              <div><dt>Rol</dt><dd>{roleLabel(role)}</dd></div>
            </dl>
          </div>
          <div className="dashboard-quick">
            <Link href="/reset-password"><span>Restablecer mi contraseña</span> ↗</Link>
            {role === "admin" && <Link href="/berta"><span>Ver ajustes de Berta AI e integraciones</span> ↗</Link>}
          </div>
        </section>
        {staff && (
          <section className="dashboard-panel" aria-labelledby="team-title">
            <div className="dashboard-panel-heading"><div><h2 id="team-title">Directorio del equipo</h2>
              <p>Roles y estado de acceso</p></div></div>
            {staff.error ? <p className="dashboard-empty">No se pudo cargar el directorio.</p>
              : !staff.data?.length ? <p className="dashboard-empty">No hay perfiles visibles.</p>
              : (
                <div className="dashboard-activity">
                  {staff.data.map(person => (
                    <div className="activity-row" key={person.id}>
                      <span className="activity-details"><strong>{person.full_name?.trim() || "Sin nombre registrado"}</strong>
                        <small>{roleLabel(person.role)}</small></span>
                      <span className={person.is_active ? "status-pill open" : "status-pill"}>{person.is_active ? "Activo" : "Inactivo"}</span>
                    </div>
                  ))}
                </div>
              )}
          </section>
        )}
      </div>
    </WorkspaceSection>
  );
}
