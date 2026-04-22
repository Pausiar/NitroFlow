"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LogOut, LayoutDashboard, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { createClient } from "@/lib/supabase-client";

type SessionUser = {
  email: string | null;
  avatar: string | null;
  name: string | null;
};

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let mounted = true;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!mounted) return;
        if (data.user) {
          setUser({
            email: data.user.email ?? null,
            avatar: (data.user.user_metadata?.avatar_url as string) ?? null,
            name:
              (data.user.user_metadata?.full_name as string) ??
              (data.user.user_metadata?.name as string) ??
              null
          });
        }
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser({
            email: session.user.email ?? null,
            avatar: (session.user.user_metadata?.avatar_url as string) ?? null,
            name:
              (session.user.user_metadata?.full_name as string) ??
              (session.user.user_metadata?.name as string) ??
              null
          });
        } else {
          setUser(null);
        }
      });
      return () => {
        mounted = false;
        sub.subscription.unsubscribe();
      };
    } catch {
      return () => {
        mounted = false;
      };
    }
  }, []);

  const signOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch {
      window.location.href = "/";
    }
  };

  const links = [
    { href: "/#features", label: "Caracteristicas" },
    { href: "/#pricing", label: "Precios" },
    { href: "/#faq", label: "FAQ" },
    { href: "/support", label: "Soporte" }
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-200 ${
        scrolled
          ? "border-b border-[var(--color-border)] glass"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === link.href
                  ? "text-white"
                  : "text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-white transition hover:border-[var(--color-border-strong)]"
              >
                <LayoutDashboard size={16} />
                Mi panel
              </Link>
              <button
                onClick={signOut}
                title="Cerrar sesion"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-white"
              >
                <LogOut size={16} />
              </button>
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name ?? "user"}
                  className="h-8 w-8 rounded-full border border-[var(--color-border)]"
                />
              ) : null}
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-md px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-white"
              >
                Iniciar sesion
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,120,212,0.35)] transition hover:bg-[var(--color-accent-hover)]"
              >
                <Sparkles size={16} />
                Comprar Pro
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-white"
          aria-label="Menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="rounded-md bg-[var(--color-card)] px-3 py-2 text-sm text-white"
              >
                Mi panel
              </Link>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-center text-sm font-medium text-white"
              >
                Iniciar sesion
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
