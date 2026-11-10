"use client";

import { useEffect, useState } from "react";
import { testBertaPrompt } from "./prompt-actions";
import { messageLimit, promptLimit } from "./prompt-limits";

export default function PromptEditor({ draftKey, basePrompt }: { draftKey: string; basePrompt: string }) {
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setInstructions((localStorage.getItem(draftKey) ?? "").slice(0, promptLimit));
    } catch {
      setNotice("El navegador bloqueó el acceso al borrador.");
    }
    setLoaded(true);
  }, [draftKey]);

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, instructions);
      setNotice("Borrador guardado en este navegador.");
    } catch {
      setNotice("No se pudo guardar el borrador en este navegador.");
    }
  }

  async function runTest() {
    if (busy || !message.trim()) return;
    setBusy(true);
    setError("");
    setReply("");
    try {
      const result = await testBertaPrompt(instructions, message);
      setReply(result.reply ?? "");
      setError(result.error ?? "");
    } catch {
      setError("No se pudo completar la prueba. Revisá tu sesión e intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="berta-panel berta-prompt" aria-labelledby="berta-prompt-title">
      <div className="berta-panel-title">
        <span className="berta-symbol" aria-hidden="true">✦</span>
        <div><h2 id="berta-prompt-title">Instrucciones de Berta</h2><p>Editor de borradores para Preview</p></div>
      </div>
      <details>
        <summary>Ver instrucciones base</summary>
        <p className="berta-prompt-text">{basePrompt}</p>
      </details>
      <label htmlFor="berta-instructions">Instrucciones complementarias</label>
      <textarea id="berta-instructions" rows={8} maxLength={promptLimit} value={instructions}
        disabled={!loaded || busy} onChange={event => {
          setInstructions(event.target.value);
          setNotice("");
        }} placeholder="Agregá pautas de atención, tono o ejemplos de respuesta." />
      <small>{instructions.length} de {promptLimit} caracteres</small>
      <div><button className="dashboard-primary" type="button" disabled={!loaded || busy} onClick={saveDraft}>Guardar borrador</button></div>
      <p className="berta-caution">El borrador se guarda en este navegador. Las instrucciones adicionales se usan únicamente en el simulador.</p>
      {notice && <p role="status">{notice}</p>}
      <label htmlFor="berta-test-message">Mensaje ficticio del cliente</label>
      <textarea id="berta-test-message" rows={3} maxLength={messageLimit} value={message}
        disabled={!loaded || busy} onChange={event => setMessage(event.target.value)}
        placeholder="Ejemplo: Hola, ¿cómo puedo hacer un pedido?" />
      <p className="berta-caution">OpenRouter procesa el texto de la prueba. Usá datos ficticios.</p>
      <div><button className="dashboard-primary" type="button" disabled={!loaded || busy || !message.trim()}
        onClick={runTest}>{busy ? "Probando…" : "Probar respuesta"}</button></div>
      {error && <p role="alert">{error}</p>}
      {reply && <div className="berta-note" role="status"><strong>Respuesta simulada</strong><p className="berta-prompt-text">{reply}</p></div>}
    </section>
  );
}
