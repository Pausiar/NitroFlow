"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Tag,
  Ticket as TicketIcon,
  Trash2,
  Users
} from "lucide-react";

type Promo = {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number | null;
  uses: number;
  active: boolean;
};

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  ai_response: string | null;
  ai_error_summary: string | null;
  created_at: string;
  user_id: string;
};

type Alert = {
  id: string;
  title: string;
  message: string;
  resolved: boolean;
  created_at: string;
  ticket_id: string | null;
};

type Tab = "overview" | "promos" | "tickets" | "alerts";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const [promos, setPromos] = useState<Promo[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(20);
  const [maxUses, setMaxUses] = useState<number | "">(50);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, t, a] = await Promise.all([
        fetch("/api/admin/promos", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/tickets", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/alerts", { cache: "no-store" }).then((r) => r.json())
      ]);
      setPromos(p.promos || p || []);
      setTickets(t.tickets || t || []);
      setAlerts(a.alerts || a || []);
    } catch {
      toast.error("Error cargando datos del admin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase(),
          discount_percent: Number(discount),
          max_uses: maxUses === "" ? null : Number(maxUses)
        })
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "Error creando promo");
        return;
      }
      toast.success("Promo creada");
      setCode("");
      setDiscount(20);
      setMaxUses(50);
      fetchAll();
    } catch {
      toast.error("Error de red");
    }
  };

  const deletePromo = async (id: string) => {
    if (!confirm("Eliminar promo?")) return;
    const res = await fetch(`/api/admin/promos/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Eliminado");
      fetchAll();
    } else {
      toast.error("Error eliminando");
    }
  };

  const stats = {
    promos: promos.length,
    activePromos: promos.filter((p) => p.active).length,
    tickets: tickets.length,
    openTickets: tickets.filter((t) => t.status === "open").length,
    alerts: alerts.length,
    pendingAlerts: alerts.filter((a) => !a.resolved).length
  };

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "overview", label: "Resumen", icon: Users },
    { id: "promos", label: "Codigos promo", icon: Tag, badge: stats.activePromos },
    { id: "tickets", label: "Tickets", icon: TicketIcon, badge: stats.openTickets },
    { id: "alerts", label: "Alertas IA", icon: AlertTriangle, badge: stats.pendingAlerts }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`mb-1 flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition ${
              tab === t.id
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-card-hover)] hover:text-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <t.icon size={14} />
              {t.label}
            </span>
            {typeof t.badge === "number" ? (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === t.id
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                }`}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </aside>

      <section>
        {loading ? (
          <div className="grid place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-[var(--color-text-muted)]">
            <Loader2 className="animate-spin" />
          </div>
        ) : tab === "overview" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Codigos activos" value={stats.activePromos} icon={Tag} color="info" />
            <StatCard label="Tickets abiertos" value={stats.openTickets} icon={TicketIcon} color="success" />
            <StatCard label="Alertas pendientes" value={stats.pendingAlerts} icon={AlertTriangle} color="warning" />
            <StatCard label="Tickets totales" value={stats.tickets} icon={TicketIcon} />
            <StatCard label="Codigos totales" value={stats.promos} icon={Tag} />
            <StatCard label="Alertas totales" value={stats.alerts} icon={AlertTriangle} />
          </div>
        ) : tab === "promos" ? (
          <div className="space-y-4">
            <form
              onSubmit={createPromo}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            >
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Plus size={14} /> Nuevo codigo promocional
              </h3>
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="CODIGO"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white"
                  required
                />
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white"
                  placeholder="% descuento"
                  required
                />
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) =>
                    setMaxUses(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  min={1}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white"
                  placeholder="Max usos (vacio = ilimitado)"
                />
                <button className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]">
                  Crear
                </button>
              </div>
            </form>

            <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-2">Codigo</th>
                    <th className="px-4 py-2">Descuento</th>
                    <th className="px-4 py-2">Usos</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                        No hay codigos.
                      </td>
                    </tr>
                  ) : (
                    promos.map((p) => (
                      <tr key={p.id} className="border-t border-[var(--color-border)] text-white">
                        <td className="px-4 py-2 font-mono">{p.code}</td>
                        <td className="px-4 py-2">{p.discount_percent}%</td>
                        <td className="px-4 py-2">
                          {p.uses} / {p.max_uses ?? "infinito"}
                        </td>
                        <td className="px-4 py-2">
                          {p.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs text-[var(--color-success)]">
                              <CheckCircle2 size={12} />
                              activo
                            </span>
                          ) : (
                            <span className="rounded-full bg-[var(--color-text-dim)]/15 px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                              inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => deletePromo(p.id)}
                            className="text-[var(--color-error)] hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "tickets" ? (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-[var(--color-text-muted)]">
                No hay tickets.
              </div>
            ) : (
              tickets.map((t) => (
                <details
                  key={t.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{t.subject}</p>
                      <p className="text-xs text-[var(--color-text-dim)]">
                        {new Date(t.created_at).toLocaleString()} - usuario {t.user_id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs uppercase text-[var(--color-text-muted)]">
                      {t.status}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-[var(--color-text-dim)]">Mensaje</p>
                      <p className="whitespace-pre-wrap text-white">{t.message}</p>
                    </div>
                    {t.ai_response ? (
                      <div>
                        <p className="text-xs text-[var(--color-text-dim)]">Respuesta IA</p>
                        <p className="whitespace-pre-wrap text-[var(--color-text)]">
                          {t.ai_response}
                        </p>
                      </div>
                    ) : null}
                    {t.ai_error_summary ? (
                      <div>
                        <p className="text-xs text-[var(--color-text-dim)]">Resumen tecnico (admin)</p>
                        <p className="whitespace-pre-wrap text-[var(--color-warning)]">
                          {t.ai_error_summary}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </details>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-[var(--color-text-muted)]">
                Sin alertas.
              </div>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-4 ${
                    a.resolved
                      ? "border-[var(--color-border)] bg-[var(--color-card)]"
                      : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{a.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        a.resolved
                          ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                          : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                      }`}
                    >
                      {a.resolved ? "resuelto" : "pendiente"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                    {a.message}
                  </p>
                  <p className="mt-2 text-[10px] text-[var(--color-text-dim)]">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color
}: {
  label: string;
  value: number;
  icon: any;
  color?: "info" | "success" | "warning";
}) {
  const tones: Record<string, string> = {
    info: "text-[var(--color-info)] bg-[var(--color-accent-soft)]",
    success: "text-[var(--color-success)] bg-[var(--color-success)]/15",
    warning: "text-[var(--color-warning)] bg-[var(--color-warning)]/15",
    default: "text-[var(--color-text-muted)] bg-[var(--color-surface)]"
  };
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">{label}</p>
        <span className={`rounded-md p-2 ${tones[color || "default"]}`}>
          <Icon size={14} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
