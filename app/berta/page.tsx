import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import CrmSidebar from "@/app/components/crm-sidebar";

export const dynamic = "force-dynamic";

const requirements = [
  { key: "OPENROUTER_API_KEY", label: "Motor de inteligencia artificial", detail: "Credencial para generar respuestas mediante OpenRouter." },
  { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Número de WhatsApp Business", detail: "Identificador del número configurado en Meta." },
  { key: "WHATSAPP_ACCESS_TOKEN", label: "Autorización de WhatsApp", detail: "Permite solicitar el envío de mensajes a Meta." },
  { key: "WHATSAPP_VERIFY_TOKEN", label: "Verificación del webhook", detail: "Debe coincidir con el token registrado en Meta Developers." },
  { key: "WHATSAPP_APP_SECRET", label: "Firma de seguridad de Meta", detail: "Protege la recepción de eventos de WhatsApp." },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Acceso seguro a la base de datos", detail: "Permite guardar mensajes desde el webhook en el servidor." },
];

export default async function BertaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims) redirect("/login");
  const role = (claims.claims.app_metadata as { role?: string } | undefined)?.role ?? "";
  if (!["admin", "manager", "agent"].includes(role)) redirect("/");
  if (role !== "admin") redirect("/dashboard");
  const checks = requirements.map(item => ({ ...item, configured: Boolean(process.env[item.key]?.trim()) }));
  const ready = checks.filter(item => item.configured).length;
  return <div className="workspace-layout">
    <CrmSidebar role={role}/>
    <div className="workspace-main">
      <header className="workspace-topbar"><div><span className="topbar-breadcrumb">MARZOE / Configuración</span><strong>Berta AI y WhatsApp</strong></div><span className="workspace-environment"><span className="workspace-dot"/> Diagnóstico de pruebas</span></header>
      <main className="berta-page">
        <p className="eyebrow">ASISTENTE VIRTUAL</p>
        <h1>Configuración de Berta AI</h1>
        <p className="berta-lead">Revisa las instrucciones comerciales de Berta y el estado de las integraciones de MARZOE.</p>
        <div className="berta-grid">
          <section className="berta-panel">
            <div className="berta-panel-title"><span className="berta-symbol">✦</span><div><h2>Identidad y atención</h2><p>Instrucciones vigentes en el código del agente</p></div></div>
            <dl className="berta-facts">
              <div><dt>Nombre del agente</dt><dd>Berta</dd></div>
              <div><dt>Idioma</dt><dd>Español boliviano</dd></div>
              <div><dt>Negocio</dt><dd>MARZOE · Tienda virtual de Cochabamba</dd></div>
              <div><dt>Especialidad</dt><dd>Productos profesionales Wella</dd></div>
              <div><dt>Atención comercial</dt><dd>Envíos a toda Bolivia</dd></div>
              <div><dt>Catálogo</dt><dd><a href="https://wa.me/c/59162603800" target="_blank" rel="noopener noreferrer">Ver catálogo de MARZOE ↗</a></dd></div>
            </dl>
            <div className="berta-note"><strong>Reglas de seguridad comercial</strong><p>No inventar precios, stock, promociones ni tiempos de entrega. No confirmar pedidos ni pagos sin verificación humana. Derivar reclamos o solicitudes de atención personal.</p></div>
          </section>
          <section className="berta-panel">
            <div className="berta-panel-title"><span className="berta-symbol">◉</span><div><h2>Integraciones del servidor</h2><p>{ready} de {checks.length} variables detectadas en este despliegue</p></div></div>
            <div className="berta-checks">{checks.map(item => <div className="berta-check" key={item.key}><div><strong>{item.label}</strong><p>{item.detail}</p></div><span className={item.configured ? "berta-ok" : "berta-missing"}>{item.configured ? "Registrada" : "Faltante"}</span></div>)}</div>
            <p className="berta-caution">«Registrada» solo confirma que existe una variable no vacía en el servidor. No comprueba que la credencial sea válida, que Meta haya aceptado el webhook ni que Berta pueda enviar mensajes.</p>
          </section>
        </div>
        <section className="berta-panel berta-next"><h2>Pruebas pendientes antes de atender clientes</h2><ol><li>Confirmar el webhook y la suscripción al evento <code>messages</code> en Meta Developers.</li><li>Verificar la autorización del número de WhatsApp y los permisos de envío.</li><li>Probar un mensaje entrante desde un número propio autorizado.</li><li>Comprobar que el mensaje aparezca en Conversaciones y que Berta responda.</li><li>Probar la pausa de IA, la derivación a un agente y la recuperación ante errores.</li></ol><p>Estas pruebas no se ejecutan automáticamente desde este panel.</p><a className="dashboard-primary" href="/conversations">Ir a conversaciones ↗</a></section>
      </main>
    </div>
  </div>;
}
