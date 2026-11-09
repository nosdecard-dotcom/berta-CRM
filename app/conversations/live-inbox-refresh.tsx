"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Refresh server-rendered inbox data while this tab is visible. */
export default function LiveInboxRefresh() {
  const router = useRouter();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      router.refresh();
      setLastSync(new Date());
    };
    const interval = window.setInterval(refresh, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  return <span className="inbox-live-status" role="status" title={lastSync ? "Última sincronización: " + lastSync.toLocaleTimeString("es-BO") : "Conectando"}>● Actualización automática cada 5 s</span>;
}
