import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">B</div>
        <p className="eyebrow">MARZOE · GESTIÓN COMERCIAL</p>
        <h1>BERTA AI CRM</h1>
        <p className="login-description">Recuperación de contraseña</p>
        <ResetPasswordForm />
        <p className="login-footnote">Acceso privado para el equipo autorizado de MARZOE.</p>
      </section>
    </main>
  );
}
