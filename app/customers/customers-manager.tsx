"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string; full_name: string; phone: string; email: string | null; city: string | null;
  notes: string | null; source: string; tags: string[]; assigned_to: string | null;
  last_contact_at: string | null; created_at: string;
};
type Staff = { id: string; full_name: string; role: string };
const empty = { full_name: "", phone: "", email: "", city: "", notes: "", source: "whatsapp", tags: "", assigned_to: "" };
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(value)) : "Sin contacto";

export default function CustomersManager({ customers, staff, role }: { customers: Customer[]; staff: Staff[]; role: string }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const filtered = useMemo(() => customers.filter((c) => [c.full_name, c.phone, c.email ?? "", c.city ?? "", ...(c.tags ?? [])].join(" ").toLowerCase().includes(query.toLowerCase())), [customers, query]);

  function openNew() { setEditing(null); setForm(empty); setError(""); setShowForm(true); }
  function openEdit(c: Customer) {
    setEditing(c); setForm({ full_name: c.full_name, phone: c.phone, email: c.email ?? "", city: c.city ?? "", notes: c.notes ?? "", source: c.source, tags: (c.tags ?? []).join(", "), assigned_to: c.assigned_to ?? "" }); setError(""); setShowForm(true);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/customers", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(editing ? { id: editing.id } : {}), ...form, tags: form.tags.split(",").map((v) => v.trim()).filter(Boolean), assigned_to: form.assigned_to || null }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "No se pudo guardar el cliente."); return; }
      setShowForm(false); router.refresh();
    } catch { setError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  return <section className="customers-content">
    <div className="customers-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, teléfono, ciudad o etiqueta..." aria-label="Buscar clientes" /><button type="button" onClick={openNew}>+ Nuevo cliente</button></div>
    {showForm && <div className="customer-form-card"><div className="panel-title"><h2>{editing ? "Editar cliente" : "Registrar cliente"}</h2><button className="form-close" type="button" onClick={() => setShowForm(false)}>Cerrar</button></div>
      <form onSubmit={save} className="customer-form">
        <label>Nombre completo<input required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>Teléfono WhatsApp<input required maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Correo electrónico<input type="email" maxLength={150} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Ciudad<input maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label>Procedencia<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="marketplace">Marketplace</option><option value="referido">Referido</option><option value="otro">Otro</option></select></label>
        <label>Etiquetas (separadas por coma)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Interesado, Wella Fusion..." /></label>
        {["admin", "manager"].includes(role) && <label>Responsable<select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><option value="">Sin asignar</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} · {s.role}</option>)}</select></label>}
        <label className="wide-field">Notas internas<textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="wide-field form-actions"><button type="button" className="form-cancel" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cliente"}</button></div>
        {error && <p className="control-error wide-field" role="alert">{error}</p>}
      </form>
    </div>}
    <div className="customers-table-wrap"><table className="customers-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Ciudad</th><th>Procedencia</th><th>Etiquetas</th><th>Último contacto</th><th></th></tr></thead><tbody>
      {filtered.map((c) => <tr key={c.id}><td><strong>{c.full_name}</strong><small>{c.email || "Sin correo"}</small></td><td>{c.phone}</td><td>{c.city || "—"}</td><td>{c.source}</td><td><div className="customer-tags">{(c.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div></td><td>{dateLabel(c.last_contact_at)}</td><td><button type="button" className="edit-customer" onClick={() => openEdit(c)}>Editar</button><a className="edit-customer" href={`/conversations?phone=${encodeURIComponent(c.phone)}`}>Chat</a></td></tr>)}
      {filtered.length === 0 && <tr><td colSpan={7} className="customers-empty">No se encontraron clientes.</td></tr>}
    </tbody></table></div>
    <p className="customers-footnote">Se muestran hasta 200 registros. El historial de WhatsApp se conserva en el módulo de conversaciones.</p>
  </section>;
}
