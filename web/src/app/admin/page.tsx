import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let isAdmin = false;
  let configError: string | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/auth/login?next=/admin");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  } catch (err) {
    configError = err instanceof Error ? err.message : "Error de configuracion";
  }

  if (configError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h1 className="text-xl font-bold text-white">Admin no disponible</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{configError}</p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h1 className="text-xl font-bold text-white">Acceso restringido</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Esta pagina es solo para administradores.
            </p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
              Panel de administracion
            </p>
            <h1 className="text-2xl font-bold text-white">Operaciones</h1>
          </div>
        </div>
        <AdminPanel />
      </main>
      <SiteFooter />
    </>
  );
}
