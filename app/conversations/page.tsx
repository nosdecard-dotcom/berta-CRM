import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import ReplyComposer from "./reply-composer";
import ConversationControls from "./conversation-controls";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  status: "open" | "pending" | "closed";
  ai_enabled: boolean;
  unread_count: number;
  last_message_at: string | null;
  updated_at: string;
  assigned_to: string | null;
  customer: { full_name: string | null; phone: string } | null;
};

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  created_at: string;
  delivery_status: string;
  ai_generated: boolean;
};

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Sin actividad";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; estado?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const [{ data: claims, error: authError }, params] = await Promise.all([
    supabase.auth.getClaims(),
    searchParams,
  ]);

  if (authError || !claims) redirect("/login");

  const metadata = (claims.claims.app_metadata ?? {}) as { role?: string };
  const role = metadata.role ?? "sin asignar";
  if (!["admin", "manager", "agent"].includes(role)) redirect("/");

  let conversationsQuery = supabase
    .from("conversations")
    .select("id,status,ai_enabled,unread_count,last_message_at,updated_at,assigned_to,customer:customers!conversations_customer_id_fkey(full_name,phone)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(60);

  if (params.estado && ["open", "pending", "closed"].includes(params.estado)) {
    conversationsQuery = conversationsQuery.eq("status", params.estado);
  }

  const { data: rawConversations, error: conversationsError } = await conversationsQuery;
  const conversations = (rawConversations ?? []) as unknown as ConversationRow[];
  const selected = conversations.find((item) => item.id === params.id) ?? conversations[0] ?? null;

  let messages: MessageRow[] = [];
  let messagesError: string | null = null;
  if (selected) {
    const { data, error } = await supabase
      .from("messages")
      .select("id,direction,body,message_type,created_at,delivery_status,ai_generated")
      .eq("conversation_id", selected.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) messagesError = error.message;
    else messages = (data ?? []) as MessageRow[];
  }

  const userId = typeof claims.claims.sub === "string" ? claims.claims.sub : "";
  let staffQuery = supabase.from("profiles").select("id,full_name,role").eq("is_active", true);
  if (role === "agent") staffQuery = staffQuery.eq("id", userId);
  const { data: staffRows } = await staffQuery.order("full_name");
  const staff = (staffRows ?? []) as { id: string; full_name: string; role: string }[];
  const staffNames = new Map(staff.map((person) => [person.id, person.full_name || person.role]));

  const customerName = (customer: ConversationRow["customer"]) =>
    customer?.full_name?.trim() || customer?.phone || "Cliente sin nombre";

  return (
    <main className="crm-shell">
      <header className="crm-header">
        <a className="crm-brand" href="/conversations">
          <span className="crm-brand-mark">B</span>
          <span><strong>BERTA AI CRM</strong><small>MARZOE · ATENCIÓN AL CLIENTE</small></span>
        </a>
        <nav className="customers-nav"><a className="active" href="/conversations">Conversaciones</a><a href="/customers">Clientes</a></nav>\n        <div className="crm-header-actions">
          <span className="crm-role">{role}</span>
          <form action="/auth/signout" method="post"><button className="crm-logout" type="submit">Cerrar sesión</button></form>
        </div>
      </header>

      <section className="crm-heading">
        <div><p className="eyebrow">CENTRO DE ATENCIÓN</p><h1>Conversaciones</h1><p>Gestiona los mensajes de WhatsApp y el seguimiento de tus clientes.</p></div>
        <div className="crm-summary"><strong>{conversations.length}</strong><span>conversaciones visibles</span></div>
      </section>

      {conversationsError ? (
        <div className="crm-alert">No fue posible cargar las conversaciones. Verifica tus permisos y vuelve a intentarlo.</div>
      ) : (
        <section className="inbox-layout">
          <aside className="conversation-panel">
            <div className="panel-title"><h2>Bandeja</h2><span>{conversations.length}</span></div>
            <nav className="conversation-filters" aria-label="Filtrar conversaciones">
              <a className={!params.estado ? "active" : ""} href="/conversations">Todas</a>
              <a className={params.estado === "open" ? "active" : ""} href="/conversations?estado=open">Abiertas</a>
              <a className={params.estado === "pending" ? "active" : ""} href="/conversations?estado=pending">Pendientes</a>
              <a className={params.estado === "closed" ? "active" : ""} href="/conversations?estado=closed">Cerradas</a>
            </nav>
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <a key={conversation.id} href={`/conversations?id=${conversation.id}${params.estado ? `&estado=${params.estado}` : ""}`} className={selected?.id === conversation.id ? "conversation-item selected" : "conversation-item"}>
                  <span className="customer-avatar">{customerName(conversation.customer).slice(0, 1).toUpperCase()}</span>
                  <span className="conversation-copy">
                    <span className="conversation-name">{customerName(conversation.customer)}</span>
                    <span className="conversation-phone">{conversation.customer?.phone ?? "Sin teléfono"}</span>
                    <span className="conversation-meta"><span className={`status-dot ${conversation.status}`}></span>{conversation.status === "open" ? "Abierta" : conversation.status === "pending" ? "Pendiente" : "Cerrada"} · {dateTime(conversation.last_message_at)}</span>
                  </span>
                  <span className="conversation-side">{conversation.ai_enabled && <span className="ai-chip">IA</span>}{conversation.unread_count > 0 && <span className="unread-count">{conversation.unread_count}</span>}</span>
                </a>
              ))}
              {conversations.length === 0 && <div className="empty-list"><span>—</span><strong>No hay conversaciones</strong><p>Cuando un cliente escriba al WhatsApp de MARZOE, aparecerá aquí.</p></div>}
            </div>
          </aside>

          <section className="thread-panel">
            {selected ? (
              <>
                <header className="thread-header">
                  <div className="thread-customer">
                    <span className="customer-avatar large">{customerName(selected.customer).slice(0, 1).toUpperCase()}</span>
                    <div><h2>{customerName(selected.customer)}</h2><p>{selected.customer?.phone ?? "Número no disponible"}</p></div>
                  </div>
                  <div className="thread-controls">
                    <span className={`status-pill ${selected.status}`}>{selected.status === "open" ? "Abierta" : selected.status === "pending" ? "Pendiente" : "Cerrada"}</span>
                    <span className={selected.ai_enabled ? "ai-state enabled" : "ai-state"}>{selected.ai_enabled ? "Berta activa" : "Atención humana"}</span>\n                    <span className="assigned-label">Responsable: {selected.assigned_to ? (staffNames.get(selected.assigned_to) ?? "Agente asignado") : "Sin asignar"}</span>
                  </div>
                </header>
                <div className="thread-notice">Canal WhatsApp <span>·</span> Actualizado {dateTime(selected.last_message_at)}</div>\n                <ConversationControls conversationId={selected.id} assignedTo={selected.assigned_to} aiEnabled={selected.ai_enabled} status={selected.status} role={role} staff={staff} />
                <div className="message-timeline">
                  {messagesError ? <div className="crm-alert">No fue posible cargar el historial de mensajes.</div> : messages.length ? messages.map((message) => (
                    <article key={message.id} className={message.direction === "outbound" ? "message-row outbound" : "message-row inbound"}>
                      <div className="message-bubble">
                        {message.body ? <p>{message.body}</p> : <p className="attachment-label">Mensaje de tipo {message.message_type}</p>}
                        <footer><span>{dateTime(message.created_at)}</span>{message.direction === "outbound" && <span>{message.ai_generated ? "Berta IA" : "Agente"}</span>}{message.direction === "outbound" && <span>{message.delivery_status}</span>}</footer>
                      </div>
                    </article>
                  )) : <div className="empty-thread"><strong>Aún no hay mensajes</strong><p>El historial de esta conversación aparecerá en este espacio.</p></div>}
                </div>
                <ReplyComposer conversationId={selected.id} disabled={selected.status === "closed"} />
              </>
            ) : (
              <div className="empty-thread"><span className="empty-icon">B</span><strong>Tu bandeja está lista</strong><p>Selecciona una conversación para revisar el historial de atención.</p></div>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
