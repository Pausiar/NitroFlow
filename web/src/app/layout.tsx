import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "NitroFlow - Optimizador inteligente para Windows",
  description:
    "Optimizador de Windows con limpieza profunda, panel de rendimiento y asistente IA. Plan Free y Pro.",
  metadataBase: new URL(env.appUrl),
  openGraph: {
    title: "NitroFlow",
    description: "Optimizador inteligente para Windows con asistente IA.",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#232325",
              border: "1px solid #38383a",
              color: "#f5f5f7"
            }
          }}
        />
      </body>
    </html>
  );
}
