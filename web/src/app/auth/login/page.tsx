import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams?.next || "/dashboard";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <div className="grid-bg absolute inset-0 opacity-50" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 -z-10 h-[600px] opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(0,120,212,0.25), transparent 60%)"
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white"
        >
          {"<"} Volver
        </Link>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-[var(--shadow-fluent-lg)]">
          <div className="flex items-center justify-center">
            <Logo size={48} />
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold text-white">
            Bienvenido a <span className="accent-gradient">NitroFlow</span>
          </h1>
          <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
            Inicia sesion para acceder a tu panel y a la licencia.
          </p>

          <div className="mt-8">
            <GoogleLoginButton next={next} />
          </div>

          <div className="mt-6 flex flex-col gap-2 text-xs text-[var(--color-text-dim)]">
            <p className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-[var(--color-success)]" />
              Tu sesion se gestiona con Supabase Auth.
            </p>
            <p className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[var(--color-info)]" />
              Solo Google. Sin contrasenas.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-text-dim)]">
          Al continuar aceptas el uso responsable del servicio.
        </p>
      </div>
    </main>
  );
}
