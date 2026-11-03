import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BERTA AI CRM | MARZOE",
  description: "CRM de WhatsApp y asistente comercial de MARZOE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
