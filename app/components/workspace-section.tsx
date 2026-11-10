import type { ReactNode } from "react";
import CrmSidebar from "./crm-sidebar";

export default function WorkspaceSection({ role, title, description, children }: {
  role: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="workspace-layout">
      <CrmSidebar role={role} />
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div><span className="topbar-breadcrumb">MARZOE / CRM</span><strong>{title}</strong></div>
          <span className="workspace-environment"><span className="workspace-dot" /> Entorno de pruebas</span>
        </header>
        <div className="dashboard-content">
          <div className="dashboard-intro"><div><h1>{title}</h1><p>{description}</p></div></div>
          {children}
        </div>
      </main>
    </div>
  );
}
