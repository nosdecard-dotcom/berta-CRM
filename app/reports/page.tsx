import Link from "next/link";
import WorkspaceSection from "@/app/components/workspace-section";
import { requireCrmWorkspace } from "@/lib/crm-workspace";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const periods = [7, 30, 90];
const numberFormat = new Intl.NumberFormat("es-BO");

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const [{ supabase, role }, params] = await Promise.all([
    requireCrmWorkspace({ supervisorsOnly: true }), searchParams,
  ]);
  const requestedDays = Number(params.dias);
  const days = periods.includes(requestedDays) ? requestedDays : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // Orders already use the server client. Only authorized supervisors can reach these totals.
  const sales = createServerSupabaseClient();
  const countOrders = () => sales.from("sales_orders").select("id", { count: "exact", head: true }).gte("created_at", since);
  const [conversations, inbound, outbound, pending, createdOrders, approvedOrders] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").gte("created_at", since),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("direction", "outbound")
      .in("delivery_status", ["sent", "delivered", "read"]).gte("created_at", since),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    countOrders(),
    countOrders()
      .in("status", ["confirmed", "preparing", "shipped", "delivered"]),
  ]);
  const metrics = [
    { label: "Conversaciones nuevas", detail: "Creadas en el período", result: conversations },
    { label: "Mensajes recibidos", detail: "Entrantes registrados en el período", result: inbound },
    { label: "Mensajes salientes", detail: "Registrados como enviados, entregados o leídos", result: outbound },
    { label: "Pendientes de atención", detail: "Estado actual, sin filtro de fecha", result: pending },
    { label: "Pedidos registrados", detail: "Creados en el período", result: createdOrders },
    { label: "Pedidos confirmados o en curso", detail: "Creados en el período y actualmente confirmados o en una etapa posterior", result: approvedOrders },
  ];

  return (
    <WorkspaceSection role={role} title="Reportes" description="Consultá la actividad de atención y pedidos de MARZOE.">
      <nav className="conversation-filters" aria-label="Período del reporte">
        {periods.map(period => (
          <Link key={period} href={`/reports?dias=${period}`} className={days === period ? "active" : undefined}
            aria-current={days === period ? "page" : undefined}>Últimos {period} días</Link>
        ))}
      </nav>
      <section className="dashboard-stats" aria-label="Indicadores de actividad">
        {metrics.map(({ label, detail, result }) => (
          <article className="stat-card" key={label}>
            <span className="stat-label">{label}</span>
            <strong>{result.error || result.count === null ? "No disponible" : numberFormat.format(result.count)}</strong>
            <span className="stat-detail">{detail}</span>
          </article>
        ))}
      </section>
      <p className="dashboard-disclaimer">Los indicadores reflejan la actividad registrada y el estado actual de los pedidos en el CRM.</p>
    </WorkspaceSection>
  );
}
