"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReplyComposer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || sending || disabled) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body: message }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      setMessage("");
      router.refresh();
      if (result.warning) setError(result.warning);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="reply-composer-wrap">
      {disabled ? (
        <p className="composer-disabled">Esta conversación está cerrada y no admite respuestas.</p>
      ) : (
        <form className="reply-composer" onSubmit={submit}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escribe una respuesta para el cliente..."
            maxLength={4096}
            rows={2}
            aria-label="Mensaje para el cliente"
            disabled={sending}
          />
          <div className="composer-actions">
            <span>{message.length}/4096 · Respuesta como agente</span>
            <button type="submit" disabled={sending || !message.trim()}>{sending ? "Enviando..." : "Enviar mensaje"}</button>
          </div>
        </form>
      )}
      {error && <p className="composer-error" role="alert">{error}</p>}
    </div>
  );
}
