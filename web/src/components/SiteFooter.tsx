import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { Github } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <LogoMark />
          <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
            Optimizador inteligente para Windows que combina herramientas profesionales con un
            asistente de IA para que tu PC siempre rinda al maximo.
          </p>
          <a
            href="https://github.com/Pausiar/NitroFlow"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white"
          >
            <Github size={16} />
            github.com/Pausiar/NitroFlow
          </a>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white">Producto</h4>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
            <li><Link href="/#features" className="hover:text-white">Caracteristicas</Link></li>
            <li><Link href="/#pricing" className="hover:text-white">Precios</Link></li>
            <li><Link href="/#faq" className="hover:text-white">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white">Cuenta</h4>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
            <li><Link href="/auth/login" className="hover:text-white">Iniciar sesion</Link></li>
            <li><Link href="/dashboard" className="hover:text-white">Mi panel</Link></li>
            <li><Link href="/support" className="hover:text-white">Soporte</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 text-xs text-[var(--color-text-dim)] sm:px-6">
          <span>(c) {new Date().getFullYear()} NitroFlow. Todos los derechos reservados.</span>
          <span>Hecho con Next.js, Supabase, Stripe y NVIDIA NIM.</span>
        </div>
      </div>
    </footer>
  );
}
