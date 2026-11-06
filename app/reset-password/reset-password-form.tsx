"use client";

import { FormEvent, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const hasRecoveryToken = fragment.get("type") === "recovery" && !!fragment.get("access_token");
    const hasCode = query.has("code") || query.has("token_hash");
    const { data: listener } = supabase.auth.onAuthStateChange((event: string) => {
      if (active && event === "PASSWORD_RECOVERY") {
        setValid(true);
        setReady(true);
      }
    });

    async function initialize() {
      try {
        if (query.get("token_hash") && query.get("type") === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: query.get("token_hash")!,
            type: "recovery",
          });
          if (error) throw error;
          if (active) setValid(true);
        } else if (query.get("code")) {
          const { error } = await supabase.auth.exchangeCodeForSession(query.get("code")!);
          if (error) throw error;
          if (active) setValid(true);
        } else if (hasRecoveryToken) {
          const { error } = await supabase.auth.setSession({
            access_token: fragment.get("access_token")!,
            refresh_token: fragment.get("refresh_token") || "",
          });
          if (error) throw error;
          if (active) setValid(true);
        }
        if (hasRecoveryToken || hasCode) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } catch {
        if (active) setMessage("El enlace no es válido o ha vencido. Solicita uno nuevo.");
      } finally {
        if (active) setReady(true);
      }
    }
    void initialize();
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function sendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setMessage("Si el correo está registrado, recibirás un enlace de recuperación. Revisa también spam.");
    } catch {
      setMessage("No se pudo solicitar el enlace. Intenta nuevamente.");
    } finally {
      setSending(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setMessage("Utiliza una contraseña de al menos 8 caracteres."); return; }
    if (password !== confirm) { setMessage("Las contraseñas no coinciden."); return; }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setCompleted(true);
      setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
    } catch {
      setMessage("No se pudo actualizar la contraseña. Solicita un enlace nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p>Validando enlace de recuperación…</p>;
  if (completed) return <div className="login-form"><p>{message}</p><a href="/login">Ir a iniciar sesión</a></div>;

  return valid ? (
    <form className="login-form" onSubmit={changePassword}>
      <label htmlFor="new-password">Nueva contraseña</label>
      <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      <label htmlFor="confirm-password">Confirmar contraseña</label>
      <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} />
      {message && <p className="form-error" role="status">{message}</p>}
      <button disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar nueva contraseña"}</button>
    </form>
  ) : (
    <form className="login-form" onSubmit={sendReset}>
      <p>Solicita un enlace nuevo para establecer tu contraseña.</p>
      <label htmlFor="reset-email">Correo electrónico</label>
      <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      {message && <p role="status">{message}</p>}
      <button disabled={sending} type="submit">{sending ? "Enviando…" : "Enviar enlace de recuperación"}</button>
      <a href="/login">Volver al inicio de sesión</a>
    </form>
  );
}
