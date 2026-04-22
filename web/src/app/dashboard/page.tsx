import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BuyProButton } from "@/components/BuyProButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let user: any = null;
  let profile: any = null;
  let recentTickets: any[] = [];

  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    user = data.user;
    if (!user) redirect("/auth/login?next=/dashboard");

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    profile = prof;

    const { data: tix } = await supabase
      .from("tickets")
      .select("id, subject, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    recentTickets = tix ?? [];
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h1 className="text-xl font-bold text-white">Configuracion pendiente</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Falta configurar Supabase. Ajusta las variables de entorno y vuelve a esta
              pagina.
            </p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const isPro = profile?.plan === "pro";
  const isAdmin = profile?.role === "admin";
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "usuario";
  const avatar = user.user_metadata?.avatar_url;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-12 w-12 rounded-full border border-[var(--color-border)]"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-card)] text-white">
                {name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                Bienvenido
              </p>
              <h1 className="text-2xl font-bold text-white">{name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                isPro
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-info)]"
                  : "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)]"
              }`}
            >
              <Sparkles size={12} />
              Plan {isPro ? "Pro" : "Free"}
            </span>
            {isAdmin ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-warning)]"
              >
                <ShieldCheck size={12} />
                Admin
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <CreditCard size={16} />
              Tu plan
            </div>
            <h2 className="mt-2 text-2xl font-bold text-white">
              {isPro ? "Plan Pro activo" : "Plan Free"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {isPro
                ? "Tienes acceso completo: limpieza profunda, asistente IA online y licencia para la app de escritorio."
                : "Estas usando el plan gratuito. Pasa a Pro para desbloquear todas las herramientas y la licencia para la app."}
            </p>
            {!isPro ? (
              <div className="mt-5 max-w-xs">
                <BuyProButton />
              </div>
            ) : (
              <Link
                href="/support"
                className="mt-5 inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-white hover:border-[var(--color-border-strong)]"
              >
                <LifeBuoy size={14} />
                Tengo un problema con mi facturacion
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <KeyRound size={16} />
              Licencia para la app
            </div>
            <h2 className="mt-2 text-lg font-bold text-white">
              {isPro ? "Activa" : "No disponible"}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Inicia sesion en NitroFlow Desktop con la misma cuenta de Google
              (<span className="text-white">{user.email}</span>) y se activara
              automaticamente.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <LifeBuoy size={16} />
                Tickets recientes
              </div>
              <Link
                href="/support"
                className="text-xs text-[var(--color-info)] hover:underline"
              >
                Ver todos
              </Link>
            </div>
            <div className="mt-4 divide-y divide-[var(--color-border)]">
              {recentTickets.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Aun no tienes tickets.{" "}
                  <Link href="/support" className="text-[var(--color-info)] hover:underline">
                    Crea uno
                  </Link>
                </div>
              ) : (
                recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href="/support"
                    className="flex items-center justify-between py-3 text-sm text-white hover:text-[var(--color-info)]"
                  >
                    <span className="truncate">{t.subject}</span>
                    <span
                      className={`ml-3 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        t.status === "open"
                          ? "bg-[var(--color-info)]/15 text-[var(--color-info)]"
                          : t.status === "answered"
                          ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                          : "bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)]"
                      }`}
                    >
                      {t.status}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <LayoutDashboard size={16} />
              Atajos
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/support"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white hover:border-[var(--color-border-strong)]"
              >
                Abrir soporte
              </Link>
              <Link
                href="/#pricing"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white hover:border-[var(--color-border-strong)]"
              >
                Ver planes
              </Link>
              <a
                href="https://github.com/Pausiar/NitroFlow"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white hover:border-[var(--color-border-strong)]"
              >
                Descargar app
              </a>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
