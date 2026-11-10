import Link from "next/link";
import WorkspaceSection from "@/app/components/workspace-section";
import { requireCrmWorkspace } from "@/lib/crm-workspace";

export const dynamic = "force-dynamic";

const pageSize = 30;
const dateTime = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz",
});

type PendingConversation = {
  id: string;
  last_message_at: string | null;
  updated_at: string;
  assigned_to: string | null;
  customer: { full_name: string | null; phone: string } | null;
};

export default async function FollowUpsPage({ searchParams }: {
  searchParams: Promise<{ vista?: string; pagina?: string }>;
}) {
  const [{ supabase, role, userId }, params] = await Promise.all([requireCrmWorkspace(), searchParams]);
  const view = role === "agent" || params.vista === "mias" ? "mias"
    : params.vista === "sin-asignar" ? "sin-asignar" : "todas";
  const requestedPage = Number(params.pagina);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000
    ? requestedPage : 1;
  const offset = (page - 1) * pageSize;
  const href = (filter: string, pageNumber = 1) => `/follow-ups?vista=${filter}&pagina=${pageNumber}`;

  let pending = supabase.from("conversations")
    .select("id,last_message_at,updated_at,assigned_to,customer:customers!conversations_customer_id_fkey(full_name,phone)", { count: "exact" })
    .eq("status", "pending");
  if (view === "mias") pending = pending.eq("assigned_to", userId);
  if (view === "sin-asignar") pending = pending.is("assigned_to", null);

  const [result, staff] = await Promise.all([
    pending.order("last_message_at", { ascending: true, nullsFirst: false })
      .order("updated_at").order("id").range(offset, offset + pageSize - 1),
    role === "agent" ? null : supabase.from("profiles").select("id,full_name").eq("is_active", true),
  ]);
  const names = new Map((staff?.data ?? []).map(person => [person.id, person.full_name]));
  const rows = (result.data ?? []) as unknown as PendingConversation[];
  const tabs = [["todas", "Todas"], ["mias", "Mis pendientes"], ["sin-asignar", "Sin asignar"]];

  return (
    <WorkspaceSection role={role} title="Seguimientos"
      description="Revisá las conversaciones que requieren atención humana, desde las de mayor tiempo sin actividad.">
      {role !== "agent" && (
        <nav className="conversation-filters" aria-label="Filtrar seguimientos">
          {tabs.map(([key, label]) => (
            <Link key={key} href={href(key)} className={view === key ? "active" : undefined}
              aria-current={view === key ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      )}
      <section className="dashboard-panel" aria-labelledby="follow-ups-title">
        <div className="dashboard-panel-heading">
          <div><h2 id="follow-ups-title">Conversaciones pendientes</h2>
            <p>{result.count === null ? "Atención humana" : `${result.count} en esta vista`}</p></div>
          <a href={href(view, page)}>Actualizar ↻</a>
        </div>
        {result.error ? (
          <p className="dashboard-empty">No se pudieron cargar los seguimientos. Volvé a intentarlo.</p>
        ) : rows.length === 0 ? (
          <p className="dashboard-empty">{page > 1 ? "No hay más conversaciones en esta página." : "No hay conversaciones pendientes en esta vista."}</p>
        ) : (
          <div className="dashboard-activity">
            {rows.map(row => {
              const name = row.customer?.full_name?.trim() || row.customer?.phone || "Cliente sin nombre";
              const owner = !row.assigned_to ? "Sin asignar" : row.assigned_to === userId
                ? "Asignada a vos" : names.get(row.assigned_to) || "Agente asignado";
              return (
                <Link key={row.id} href={`/conversations?id=${row.id}`} prefetch={false} className="activity-row">
                  <span className="customer-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                  <span className="activity-details"><strong>{name}</strong>
                    <small>{owner} · {row.last_message_at ? dateTime.format(new Date(row.last_message_at)) : "Sin mensajes"}</small></span>
                  <span className="status-pill pending">Pendiente</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      {!result.error && (page > 1 || (result.count ?? 0) > offset + pageSize) && (
        <nav className="conversation-filters" aria-label="Páginas de seguimientos">
          {page > 1 && <Link href={href(view, page - 1)}>← Anterior</Link>}
          {(result.count ?? 0) > offset + pageSize && <Link href={href(view, page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </WorkspaceSection>
  );
}
