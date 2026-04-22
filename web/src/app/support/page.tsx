import Link from "next/link";
import { LifeBuoy, Mail, MessageSquare, Bot } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SupportClient } from "@/components/SupportClient";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <LifeBuoy size={16} />
              Centro de soporte
            </div>
            <h1 className="mt-1 text-3xl font-bold text-white">Como podemos ayudarte?</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Crea un ticket y nuestro asistente <strong className="text-white">NitroBot AI</strong> te
              respondera en segundos. Si el caso es complejo, un humano lo revisara.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm text-white hover:border-[var(--color-border-strong)]"
          >
            Ir al panel
          </Link>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <Bot size={18} className="mt-0.5 text-[var(--color-info)]" />
            <div>
              <p className="text-sm font-semibold text-white">Respuesta IA inmediata</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Powered by NVIDIA NIM (z-ai/glm-5.1).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <MessageSquare size={18} className="mt-0.5 text-[var(--color-success)]" />
            <div>
              <p className="text-sm font-semibold text-white">Historial completo</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Consulta tus tickets anteriores cuando quieras.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <Mail size={18} className="mt-0.5 text-[var(--color-warning)]" />
            <div>
              <p className="text-sm font-semibold text-white">Escalado a humano</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Los casos criticos se notifican al equipo.
              </p>
            </div>
          </div>
        </div>

        <SupportClient />
      </main>
      <SiteFooter />
    </>
  );
}
