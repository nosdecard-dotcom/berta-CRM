import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import CrmSidebar from "@/app/components/crm-sidebar";

export const dynamic = "force-dynamic";

function countLabel(count: number | null, error: unknown) { return error ? "—" : new Intl.NumberFormat("es-BO").format(count ?? 0); }
function when(value: string | null) { return value ? new Intl.DateTimeFormat("es-BO", {dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Sin actividad"; }

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) redirect("/login");
  const role = (claims.claims.app_metadata as { role?: string } | undefined)?.role ?? "";
  if (!["admin", "manager", "agent"].includes(role)) redirect("/");
  const [customers, all, open, pending, ai, recent] = await Promise.all([
    supabase.from("customers").select("id", { count:"exact", head:true }),
    supabase.from("conversations").select("id", { count:"exact", head:true }),
    supabase.from("conversations").select("id", { count:"exact", head:true }).eq("status","open"),
    supabase.from("conversations").select("id", { count:"exact", head:true }).eq("status","pending"),
    supabase.from("conversations").select("id", { count:"exact", head:true }).eq("ai_enabled",true).neq("status","closed"),
    supabase.from("conversations").select("id,status,ai_enabled,last_message_at,customer:customers!conversations_customer_id_fkey(full_name,phone)").order("last_message_at",{ascending:false,nullsFirst:false}).limit(6),
  ]);
  const stats = [
    { label:"Clientes registrados", value:countLabel(customers.count,customers.error), detail:"Contactos en tu CRM", symbol:"♙", href:"/customers" },
    { label:"Conversaciones totales", value:countLabel(all.count,all.error), detail:"Historial accesible", symbol:"◉", href:"/conversations" },
    { label:"Conversaciones abiertas", value:countLabel(open.count,open.error), detail:"En atención", symbol:"↗", href:"/conversations?estado=open" },
    { label:"Pendientes", value:countLabel(pending.count,pending.error), detail:"Requieren seguimiento", symbol:"◷", href:"/conversations?estado=pending" },
  ];
  const rows = (recent.data ?? []) as unknown as {id:string;status:string;ai_enabled:boolean;last_message_at:string|null;customer:{full_name:string|null;phone:string}|null}[];
  return <div className="workspace-layout">
    <CrmSidebar role={role}/>
    <main className="workspace-main">
      <header className="workspace-topbar"><div><span className="topbar-breadcrumb">MARZOE / Panel de control</span><strong>Resumen general</strong></div><span className="workspace-environment"><span className="workspace-dot"/> Entorno de pruebas</span></header>
      <div className="dashboard-content">
        <div className="dashboard-intro"><div><p className="eyebrow">CENTRO DE OPERACIONES</p><h1>Bienvenido a BERTA AI CRM</h1><p>Tu espacio para gestionar la atención y las relaciones comerciales de MARZOE.</p></div><a className="dashboard-primary" href="/conversations">Ir a conversaciones ↗</a></div>
        <section className="dashboard-stats" aria-label="Indicadores principales">{stats.map(stat=><a href={stat.href} className="stat-card" key={stat.label}><span className="stat-icon">{stat.symbol}</span><span className="stat-label">{stat.label}</span><strong>{stat.value}</strong><span className="stat-detail">{stat.detail} <span>↗</span></span></a>)}</section>
        <div className="dashboard-columns">
          <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Actividad reciente</h2><p>Últimas conversaciones visibles en el CRM</p></div><a href="/conversations">Ver bandeja ↗</a></div>
            {recent.error ? <p className="dashboard-empty">No se pudo consultar la actividad. Revisa los permisos de acceso.</p> : rows.length === 0 ? <div className="dashboard-empty"><span className="dashboard-empty-icon">◉</span><strong>Aún no hay conversaciones</strong><p>Cuando se reciban mensajes por WhatsApp, la actividad aparecerá aquí.</p><a href="/conversations">Abrir bandeja</a></div> : <div className="dashboard-activity">{rows.map(row=><a href={`/conversations?id=${row.id}`} key={row.id} className="activity-row"><span className="customer-avatar">{(row.customer?.full_name||row.customer?.phone||"C").charAt(0).toUpperCase()}</span><span className="activity-details"><strong>{row.customer?.full_name||row.customer?.phone||"Cliente"}</strong><small>{when(row.last_message_at)}</small></span><span className={`status-pill ${row.status}`}>{row.status==="open"?"Abierta":row.status==="pending"?"Pendiente":"Cerrada"}</span></a>)}</div>}
          </section>
          <div className="dashboard-side">
            <section className="dashboard-panel dashboard-ai"><div className="dashboard-panel-heading"><div><h2>Berta AI</h2><p>Estado de conversaciones</p></div><span className="dashboard-spark">✦</span></div><strong className="dashboard-ai-number">{countLabel(ai.count,ai.error)}</strong><p>Conversaciones no cerradas con IA habilitada</p><span className="dashboard-info">La conexión y las respuestas automáticas aún deben probarse con WhatsApp.</span></section>
            <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Accesos rápidos</h2><p>Continúa tu trabajo</p></div></div><div className="dashboard-quick"><a href="/customers">♙ <span>Gestionar clientes</span> ↗</a><a href="/conversations?estado=pending">◷ <span>Revisar pendientes</span> ↗</a><a href="/conversations">◉ <span>Abrir conversaciones</span> ↗</a></div></section>
          </div>
        </div>
        <p className="dashboard-disclaimer">Los indicadores muestran registros accesibles según los permisos de tu usuario. No representan ventas, ingresos ni actividad verificada de WhatsApp.</p>
      </div>
    </main>
  </div>;
}
