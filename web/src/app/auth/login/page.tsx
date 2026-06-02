import Link from "next/link";
import { ShieldCheck, Sparkles, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { getMissingSupabasePublicEnv } from "@/lib/public-env";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

const getSafeNextPath = (next?: string) => {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  return next;
};

const getAuthErrorMessage = (error?: string) => {
  if (error === "supabase_config") {
    return "Supabase no esta configurado. Define las variables publicas antes de habilitar el login.";
  }
  if (error === "supabase_unavailable") {
    return "No podemos conectar con Supabase ahora mismo. Si el proyecto estaba pausado, reanudalo y vuelve a intentarlo.";
  }
  if (error === "auth") {
    return "Google no pudo completar el inicio de sesion. Revisa las URL de redireccion autorizadas.";
  }
  return null;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(params.next);
  const missingSupabaseEnv = getMissingSupabasePublicEnv();
  const authError = getAuthErrorMessage(params.error);
  const loginDisabled = missingSupabaseEnv.length > 0;

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

          {authError ? (
            <div className="mt-5 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
              <div className="flex gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{authError}</p>
              </div>
            </div>
          ) : null}

          {missingSupabaseEnv.length > 0 ? (
            <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-muted)]">
              <p className="font-semibold text-white">Configuracion pendiente</p>
              <p className="mt-1">
                Faltan variables: {missingSupabaseEnv.join(", ")}. Configuralas en Vercel o en
                desarrollo local para activar Google OAuth.
              </p>
            </div>
          ) : null}

          <div className="mt-8">
            <GoogleLoginButton next={next} disabled={loginDisabled} />
          </div>

          <div className="mt-6 flex flex-col gap-2 text-xs text-[var(--color-text-dim)]">
            <p className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-[var(--color-success)]" />
              Tu sesion se gestiona de forma segura con Supabase Auth.
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
