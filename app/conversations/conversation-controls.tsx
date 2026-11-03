"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StaffOption = { id: string; full_name: string; role: string };

export default function ConversationControls({
  conversationId, assignedTo, aiEnabled, status, role, staff,
}: {
  conversationId: string; assignedTo: string | null; aiEnabled: boolean;
  status: string; role: string; staff: StaffOption[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const canAssign = role === "admin" || role === "manager";

  async function update(action: string, assignedToValue?: string | null) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/conversation-control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action, ...(action === "assign" ? { assignedTo: assignedToValue } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "No se pudo actualizar."); return; }
      router.refresh();
    } catch { setError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  return (
    <div className="conversation-controls">
      {canAssign && (
        <label className="assign-control">
          <span>Responsable</span>
          <select value={assignedTo ?? ""} disabled={busy} onChange={(event) => update("assign", event.target.value || null)}>
            <option value="">Sin asignar</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || "Usuario"} · {person.role}</option>)}
          </select>
        </label>
      )}
      <button className="control-button" type="button" disabled={busy} onClick={() => update("toggle_ai")}>
        {aiEnabled ? "Pausar Berta" : "Activar Berta"}
      </button>
      <button className="control-button secondary" type="button" disabled={busy} onClick={() => update("toggle_status")}>
        {status === "closed" ? "Reabrir" : "Cerrar conversación"}
      </button>
      {error && <span className="control-error" role="alert">{error}</span>}
    </div>
  );
}
