import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import CustomersManager from "./customers-manager";

export const dynamic = "force-dynamic";
type Search = Promise<{ cliente?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: claims, error }, params] = await Promise.all([supabase.auth.getClaims(), searchParams]);
  if (error || !claims) redirect("/login");
  const role = (claims.claims.app_metadata as { role?: string } | undefined)?.role ?? "";
  if (!["admin", "manager", "agent"].includes(role)) redirect("/");

  const [{ data: customers, error: customersError }, { data: staff }] = await Promise.all([
    supabase.from("customers").select("id,full_name,phone,email,city,notes,source,tags,assigned_to,last_contact_at,created_at").order("last_contact_at", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("profiles").select("id,full_name,role").eq("is_active", true).order("full_name"),
  ]);
  const selectedCustomer = (customers ?? []).find((c) => c.id === params.cliente) ?? null;
  let history: { id: string; status: string; channel: string; last_message_at: string | null; message_count: number }[] = [];
  if (selectedCustomer) {
    const { data: conversations } = await supabase.from("conversations").select("id,status,channel,last_message_at").eq("customer_id", selectedCustomer.id).order("last_message_at", { ascending: false });
    history = await Promise.all((conversations ?? []).map(async (item) => {
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", item.id);
      return { ...item, message_count: count ?? 0 };
    }));
  }

  return <main className="customers-shell">
    <header className="crm-header">
      <a className="crm-brand" href="/conversations"><span className="crm-brand-mark">B</span><span><strong>BERTA AI CRM</strong><small>MARZOE · ATENCIÓN AL CLIENTE</small></span></a>
      <nav className="customers-nav"><a href="/conversations">Conversaciones</a><a className="active" href="/customers">Clientes</a></nav>
    </header>
    <section className="crm-heading">
      <div><p className="eyebrow">GESTIÓN COMERCIAL</p><h1>Clientes</h1><p>Administra los contactos y conserva el historial comercial de MARZOE.</p></div>
      <div className="crm-summary"><strong>{customers?.length ?? 0}</strong><span>clientes registrados</span></div>
    </section>
    {customersError ? <div className="crm-alert">No fue posible cargar los clientes. Verifica tus permisos.</div> :
      <CustomersManager customers={customers ?? []} staff={staff ?? []} role={role} selectedCustomer={selectedCustomer} history={history} />}
  </main>;
}
