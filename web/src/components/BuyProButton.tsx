"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export function BuyProButton({
  variant = "primary",
  className = ""
}: {
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const [promo, setPromo] = useState("");
  const [showPromo, setShowPromo] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkout = async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/auth/login?next=/%23pricing";
        return;
      }
    } catch {
      window.location.href = "/auth/login?next=/%23pricing";
      return;
    }

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: promo || null })
      });

      if (res.status === 401) {
        window.location.href = "/auth/login?next=/%23pricing";
        return;
      }

      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "No se pudo iniciar el checkout");
        setLoading(false);
        return;
      }

      window.location.href = body.url;
    } catch {
      toast.error("Error de red al iniciar el checkout");
      setLoading(false);
    }
  };

  const base =
    variant === "primary"
      ? "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,120,212,0.4)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
      : "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3 text-sm font-medium text-white transition hover:border-[var(--color-border-strong)] disabled:opacity-60";

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <button onClick={checkout} disabled={loading} className={base}>
        <Sparkles size={16} />
        {loading ? "Redirigiendo..." : "Comprar plan Pro"}
      </button>

      {showPromo ? (
        <div className="flex gap-2">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())}
            placeholder="CODIGO PROMO"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowPromo(true)}
          className="inline-flex items-center justify-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-white"
          type="button"
        >
          <Tag size={12} />
          Tengo un codigo promocional
        </button>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-dim)]">
        <ShieldCheck size={12} />
        Pago seguro con Stripe. Cancelas cuando quieras.
      </p>
    </div>
  );
}
