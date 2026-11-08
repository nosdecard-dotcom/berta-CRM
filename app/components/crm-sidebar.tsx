"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";

const items = [
  { href: "/dashboard", label: "Resumen general", icon: "▦", section: "GENERAL" },
  { href: "/conversations", label: "Conversaciones", icon: "◉", section: "OPERACIONES" },
  { href: "/customers", label: "Clientes", icon: "♙", section: "OPERACIONES" },
  { href: "/catalog", label: "Productos Wella", icon: "▤", section: "OPERACIONES" },
  { href: "/orders", label: "Pedidos", icon: "◇", section: "OPERACIONES" },
  { href: "/berta", label: "Berta AI", icon: "✦", section: "CONFIGURACIÓN" },
];
const planned = [
  { label: "Seguimientos", icon: "◷" },
  { label: "Reportes", icon: "▥" },
  { label: "Equipo y ajustes", icon: "⚙" },
];

export default function CrmSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <button type="button" className="sidebar-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="crm-sidebar" aria-label={open ? "Cerrar menú" : "Abrir menú"}>{open ? "✕ Cerrar" : "☰ Menú"}</button>
      {collapsed && <button type="button" className="sidebar-reopen" onClick={() => setCollapsed(false)} aria-label="Mostrar menú lateral">☰ Menú</button>}
      {open && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
      <aside id="crm-sidebar" className={`crm-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-brand-row"><a className="sidebar-brand" href="/dashboard"><span className="crm-brand-mark">B</span><span><strong>BERTA AI CRM</strong><small>MARZOE · GESTIÓN COMERCIAL</small></span></a><button type="button" className="sidebar-collapse-button" onClick={() => setCollapsed(true)} aria-label="Ocultar menú lateral" title="Ocultar menú">«</button></div>
        <div className="sidebar-workspace"><span className="workspace-dot" /> Espacio MARZOE <span className="workspace-live">Pruebas</span></div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {items.filter(item => item.href !== "/berta" || role === "admin").map((item, i, visibleItems) => <div key={item.href}>
            {(i === 0 || item.section !== visibleItems[i-1].section) && <p className="sidebar-section">{item.section}</p>}
            <a href={item.href} className={pathname.startsWith(item.href) ? "sidebar-link active" : "sidebar-link"} aria-current={pathname.startsWith(item.href) ? "page" : undefined}><span className="sidebar-icon">{item.icon}</span>{item.label}</a>
          </div>)}
          <p className="sidebar-section">PRÓXIMAMENTE</p>
          {planned.map(item => <span key={item.label} className="sidebar-link disabled" title="Módulo pendiente de desarrollo"><span className="sidebar-icon">{item.icon}</span>{item.label}<span className="sidebar-soon">Pronto</span></span>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-account"><span className="sidebar-avatar">{role.charAt(0).toUpperCase()}</span><span><strong>Equipo MARZOE</strong><small>{role === "admin" ? "Administrador" : role === "manager" ? "Supervisor" : "Agente"}</small></span></div><form action="/auth/signout" method="post"><button className="sidebar-signout" type="submit">Cerrar sesión ↗</button></form></div>
      </aside>
    </>
  );
}
