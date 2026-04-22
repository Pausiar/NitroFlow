"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Inbox, Loader2, Plus, Send, User } from "lucide-react";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  ai_response: string | null;
  created_at: string;
};

const statusStyles: Record<Ticket["status"], string> = {
  open: "bg-[var(--color-info)]/15 text-[var(--color-info)]",
  answered: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  closed: "bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)]"
};

export function SupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/tickets", { cache: "no-store" });
      if (res.status === 401) {
        setAuthError("Inicia sesion para ver tus tickets.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "No se pudieron cargar los tickets");
        setLoading(false);
        return;
      }
      setTickets(body.tickets || []);
      setLoading(false);
    } catch {
      toast.error("Error de red");
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 4 || message.trim().length < 10) {
      toast.error("Asunto >= 4 caracteres y mensaje >= 10");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message })
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "Error enviando ticket");
        setSubmitting(false);
        return;
      }
      toast.success("Ticket enviado. La IA ya esta revisandolo.");
      setSubject("");
      setMessage("");
      setComposing(false);
      await refresh();
      if (body.ticketId) setSelectedId(body.ticketId);
    } catch {
      toast.error("Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  const selected = tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  if (authError) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
        <p className="text-white">{authError}</p>
        <a
          href="/auth/login?next=/support"
          className="mt-4 inline-flex rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          Iniciar sesion
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Inbox size={16} />
            Mis tickets
          </div>
          <button
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            <Plus size={12} />
            Nuevo
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-[var(--color-text-muted)]">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
              Aun no tienes tickets. Crea el primero.
            </div>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedId(t.id);
                  setComposing(false);
                }}
                className={`w-full border-b border-[var(--color-border)] p-3 text-left text-sm transition ${
                  selected?.id === t.id
                    ? "bg-[var(--color-card-hover)]"
                    : "hover:bg-[var(--color-card-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-white">{t.subject}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${statusStyles[t.status]}`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                  {t.message}
                </div>
                <div className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                  {new Date(t.created_at).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        {composing || (!selected && !loading) ? (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Nuevo ticket</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Cuentanos tu problema. Nuestro asistente IA te respondera en segundos y
                un humano revisara los casos complejos.
              </p>
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              maxLength={120}
              required
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe tu problema, que esperabas y que pasa en su lugar..."
              rows={8}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              maxLength={5000}
              required
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-dim)]">
                {message.length} / 5000
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {submitting ? "Enviando..." : "Enviar ticket"}
              </button>
            </div>
          </form>
        ) : selected ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.subject}</h2>
                <p className="text-xs text-[var(--color-text-dim)]">
                  Creado {new Date(selected.created_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[10px] uppercase tracking-wide ${statusStyles[selected.status]}`}
              >
                {selected.status}
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-card-hover)] text-white">
                  <User size={16} />
                </div>
                <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-xs text-[var(--color-text-dim)]">Tu mensaje</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-white">
                    {selected.message}
                  </p>
                </div>
              </div>

              {selected.ai_response ? (
                <div className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-white">
                    <Bot size={16} />
                  </div>
                  <div className="flex-1 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-info)]">
                      <span className="font-semibold">NitroBot AI</span>
                      <span className="rounded-full bg-[var(--color-info)]/20 px-2 py-0.5 text-[9px] uppercase tracking-wide">
                        IA
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-white">
                      {selected.ai_response}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-white">
                    <Bot size={16} />
                  </div>
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    NitroBot esta analizando tu ticket...
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
