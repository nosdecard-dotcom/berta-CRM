"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("No se pudo iniciar sesión. Verifica tu correo y contraseña.");
        return;
      }

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servicio de acceso. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="email">Correo electrónico</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="usuario@marzoe.com"
        required
      />

      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Ingresa tu contraseña"
        required
      />

      {searchParams.get("error") === "config" && (
        <p className="form-error">La autenticación todavía no está configurada en el servidor.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Ingresando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
