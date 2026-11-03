import { Suspense } from "react";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">B</div>
        <p className="eyebrow">MARZOE · GESTIÓN COMERCIAL</p>
        <h1>BERTA AI CRM</h1>
        <p className="login-description">Inicia sesión para acceder al espacio de trabajo.</p>
        <Suspense fallback={<p>Preparando acceso…</p>}>
          <LoginForm />
        </Suspense>
        <p className="login-footnote">Acceso privado para el equipo autorizado de MARZOE.</p>
      </section>
    </main>
  );
}
