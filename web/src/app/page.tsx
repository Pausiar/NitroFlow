import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Download,
  Gauge,
  HardDrive,
  ListChecks,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BuyProButton } from "@/components/BuyProButton";

const APP_VERSION = "1.3.0";
const DOWNLOAD_URL = "https://github.com/Pausiar/NitroFlow/releases/latest";

const features = [
  {
    icon: Sparkles,
    title: "Optimización en 1 clic",
    description:
      "Pulsa «Analizar mi PC» y recibe una puntuación de salud de 0 a 100, con los problemas explicados en lenguaje sencillo. «Optimizar ahora» aplica solo lo que tú elijas."
  },
  {
    icon: Trash2,
    title: "Limpieza segura",
    description:
      "Borra lo que Windows y los programas regeneran: temporales de más de 24 horas, cachés de navegadores, Windows Update, informes de errores y volcados de memoria. La papelera y Prefetch son opcionales y avisan antes."
  },
  {
    icon: Rocket,
    title: "Programas de inicio",
    description:
      "Cada programa llega con una recomendación clara: Recomendado desactivar, Mantener u Opcional. Los programas esenciales, como el antivirus y los drivers, están protegidos."
  },
  {
    icon: Zap,
    title: "Modos de rendimiento",
    description:
      "Equilibrado, Rendimiento y Juegos. NitroFlow guarda tus ajustes originales y el modo Equilibrado los restaura exactamente. Pensado también para portátiles."
  },
  {
    icon: Gauge,
    title: "Panel de rendimiento",
    description:
      "CPU, RAM, disco y red en vivo, con historial visual para detectar cuellos de botella al instante."
  },
  {
    icon: Bot,
    title: "Asistente con IA",
    description:
      "Opcional, con NVIDIA NIM. Responde dudas sobre tu sistema y propone mejoras. Funciona sin API key en modo offline y nunca ejecuta acciones sin tu confirmación."
  }
];

const steps = [
  {
    icon: Search,
    title: "Analiza tu PC",
    description:
      "Pulsa «Analizar mi PC» en el Panel. NitroFlow revisa tu sistema y te da una puntuación de 0 a 100 con los problemas explicados sin tecnicismos."
  },
  {
    icon: ListChecks,
    title: "Revisa la propuesta",
    description:
      "Cada cambio aparece con su explicación antes de aplicar nada. Tú decides qué se hace y qué se queda como está."
  },
  {
    icon: RotateCcw,
    title: "Optimiza con red de seguridad",
    description:
      "Pulsa «Optimizar ahora». Antes de los cambios importantes se crea un punto de restauración de Windows, y lo que sea reversible se puede deshacer desde Historial."
  }
];

const facts = [
  { label: "Versión actual", value: APP_VERSION },
  { label: "Windows compatible", value: "10 y 11" },
  { label: "Modo por defecto", value: "Sencillo" },
  { label: "Para deshacer cambios", value: "Historial" }
];

const faqs = [
  {
    q: "Es seguro tocar el registro?",
    a: "Si. NitroFlow hace un backup .reg automatico antes de cualquier cambio y bloquea claves criticas como SYSTEM, SAM, Security y Winlogon."
  },
  {
    q: "Se borran mis documentos o fotos?",
    a: "No. La limpieza solo elimina archivos temporales de más de 24 horas y cachés que Windows o los programas regeneran. Documentos, fotos y vídeos no se tocan."
  },
  {
    q: "Qué pasa si algo sale mal?",
    a: "Antes de los cambios importantes NitroFlow crea un punto de restauración de Windows, que puedes usar desde «Restaurar sistema». Los cambios de inicio y de modo de rendimiento se pueden deshacer desde Historial."
  },
  {
    q: "Como funciona el asistente de IA?",
    a: "El asistente analiza el contexto que compartes para responder preguntas y proponer optimizaciones. Nunca ejecuta acciones sin tu confirmacion."
  },
  {
    q: "Como verifica la app de escritorio mi licencia Pro?",
    a: "La licencia se valida de forma segura desde el servidor. El sistema comprueba el estado de activacion y habilita las funciones correspondientes sin exponer claves ni logica interna."
  },
  {
    q: "Puedo cancelar el plan Pro?",
    a: "Si, en cualquier momento desde tu portal de cliente de Stripe. Mantienes acceso hasta el final del periodo facturado."
  }
];

const startupExamples = [
  {
    name: "Actualizador de un programa",
    tag: "Recomendado desactivar",
    cls: "text-orange-300 bg-orange-500/15 border-orange-500/30"
  },
  {
    name: "Antivirus",
    tag: "Mantener · protegido",
    cls: "text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/30"
  },
  {
    name: "Driver de audio",
    tag: "Mantener · protegido",
    cls: "text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/30"
  },
  {
    name: "Chat de escritorio",
    tag: "Opcional",
    cls: "text-[var(--color-text-muted)] bg-[var(--color-surface)] border-[var(--color-border)]"
  }
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-3 py-1 text-xs text-[var(--color-text-muted)] backdrop-blur">
                <Sparkles size={12} className="text-[var(--color-accent)]" />
                Novedad en {APP_VERSION}: optimización en 1 clic
              </div>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
                Optimiza tu PC en 1 clic,
                <br />
                <span className="accent-gradient">sin riesgos</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base text-[var(--color-text-muted)] sm:text-lg">
                NitroFlow analiza tu Windows, te explica en lenguaje sencillo qué se puede
                mejorar y aplica las mejoras que tú elijas, con un punto de restauración de
                Windows como red de seguridad.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href={DOWNLOAD_URL}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,120,212,0.4)] transition hover:bg-[var(--color-accent-hover)]"
                >
                  <Download size={16} />
                  Descargar para Windows
                </a>
                <Link
                  href="#como-funciona"
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-3 text-sm font-medium text-white hover:border-[var(--color-border-strong)]"
                >
                  Cómo funciona
                  <ArrowRight size={16} />
                </Link>
              </div>
              <p className="mt-4 text-xs text-[var(--color-text-dim)]">
                Versión {APP_VERSION} · Windows 10 y 11 · Gratis para empezar
              </p>
            </div>

            <div className="relative mx-auto mt-16 max-w-5xl">
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-xs text-[var(--color-text-dim)]">
                    NitroFlow - Panel
                  </span>
                </div>
                <div className="grid grid-cols-12">
                  <div className="col-span-3 border-r border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
                    {[
                      { icon: Gauge, label: "Panel" },
                      { icon: Trash2, label: "Limpieza" },
                      { icon: Rocket, label: "Programas de inicio" },
                      { icon: Zap, label: "Rendimiento" },
                      { icon: Bot, label: "Asistente IA" }
                    ].map(({ icon: Icon, label }, i) => (
                      <div
                        key={label}
                        className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 ${
                          i === 0
                            ? "bg-[var(--color-accent)] text-white"
                            : "text-[var(--color-text-muted)]"
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="col-span-9 space-y-4 p-6">
                    <div>
                      <p className="text-lg font-semibold text-white">Panel de rendimiento</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Estado del sistema en tiempo real
                        <span className="live-dot ml-2 inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "CPU", value: "23%", color: "var(--color-accent)" },
                        { label: "RAM", value: "47%", color: "var(--color-success)" },
                        { label: "Disco", value: "62%", color: "var(--color-warning)" },
                        { label: "Red", value: "12 KB/s", color: "var(--color-info)" }
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3"
                        >
                          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
                            {m.label}
                          </div>
                          <div className="mt-1 text-xl font-bold text-white">{m.value}</div>
                          <div className="mt-2 h-1.5 w-full rounded bg-[var(--color-surface)]">
                            <div
                              className="h-full rounded shimmer"
                              style={{ width: m.value, background: m.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
                        Historial CPU
                      </div>
                      <svg viewBox="0 0 400 80" className="h-20 w-full">
                        <defs>
                          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0078d4" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#0078d4" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,60 L40,55 L80,40 L120,48 L160,30 L200,38 L240,20 L280,28 L320,15 L360,25 L400,18 L400,80 L0,80 Z"
                          fill="url(#g1)"
                        />
                        <path
                          d="M0,60 L40,55 L80,40 L120,48 L160,30 L200,38 L240,20 L280,28 L320,15 L360,25 L400,18"
                          stroke="#64d2ff"
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="absolute -inset-x-20 -bottom-16 h-44 -z-10 rounded-full opacity-60"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(0,120,212,0.45), transparent 70%)"
                }}
                aria-hidden
              />
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]/50">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-4 sm:px-6">
            {facts.map((f) => (
              <div key={f.label} className="text-center">
                <div className="text-2xl font-bold text-white sm:text-3xl">{f.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                  {f.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Todo en una sola app</h2>
            <p className="mt-3 text-[var(--color-text-muted)]">
              Un panel sencillo por defecto, diseñado para ser seguro desde el primer clic.
              Las herramientas expertas siguen disponibles si las necesitas.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="hover-lift rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-info)]">
                  <f.icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Cómo funciona</h2>
            <p className="mt-3 text-[var(--color-text-muted)]">
              Tres pasos, sin conocimientos técnicos.
            </p>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <s.icon size={18} className="text-[var(--color-info)]" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">{s.description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <a
              href={DOWNLOAD_URL}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
            >
              <Download size={16} />
              Descargar para Windows
            </a>
          </div>
        </section>

        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]/40">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-xs text-[var(--color-info)]">
                <ShieldCheck size={12} />
                Seguridad por defecto
              </div>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Seguro. Reversible. Transparente.
              </h2>
              <p className="mt-3 text-[var(--color-text-muted)]">
                Un punto de restauración de Windows antes de los cambios importantes, reglas de
                limpieza estrictas y programas esenciales protegidos. Lo que se puede deshacer,
                se deshace desde Historial.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-[var(--color-text)]">
                {[
                  "Punto de restauración automático antes de los cambios importantes (desactivable en Ajustes)",
                  "Limpieza solo de temporales y cachés regenerables: nunca documentos, fotos ni vídeos",
                  "Navegadores: solo carpetas de caché, nunca contraseñas, historial ni cookies",
                  "Antivirus y drivers protegidos; System32, WinSxS y procesos críticos bloqueados",
                  "Modo sencillo por defecto; los datos se anonimizan antes de enviarse a la IA"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-fluent-lg)]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">Programas de inicio</p>
                <span className="inline-flex items-center rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-info)]">
                  Ejemplo
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {startupExamples.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
                  >
                    <span className="text-white">{item.name}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${item.cls}`}
                    >
                      {item.tag}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-[var(--color-text-dim)]">
                Los programas esenciales nunca se desactivan. Todo cambio se puede deshacer desde
                Historial.
              </p>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Precios simples</h2>
            <p className="mt-3 text-[var(--color-text-muted)]">
              Empieza gratis. Pasa a Pro cuando quieras desbloquear todo.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
                Free
              </p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white">0$</span>
                <span className="text-[var(--color-text-muted)]">/ siempre</span>
              </div>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Para uso personal basico.
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {[
                  "Limpieza basica de archivos temporales",
                  "Panel de rendimiento en vivo",
                  "Asistente IA en modo offline",
                  "Tickets de soporte"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white">
                    <Check size={16} className="mt-0.5 text-[var(--color-success)]" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/login"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-sm font-medium text-white hover:border-[var(--color-border-strong)]"
              >
                Empezar gratis
              </Link>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-accent)] bg-gradient-to-b from-[var(--color-accent-soft)] to-[var(--color-card)] p-8">
              <div className="absolute right-4 top-4 rounded-full bg-[var(--color-accent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recomendado
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-info)]">
                Pro
              </p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white">9.99$</span>
                <span className="text-[var(--color-text-muted)]">/ mes</span>
              </div>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Todo Free + funciones avanzadas y licencia para la app.
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {[
                  "Limpieza profunda + optimizador de registro",
                  "Asistente con IA online",
                  "Licencia para la app de escritorio",
                  "Codigos promocionales y soporte prioritario",
                  "Historial extendido y exportacion"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-white">
                    <Check size={16} className="mt-0.5 text-[var(--color-success)]" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <BuyProButton />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]/40">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-3">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                Licencia integrada con la app
              </h2>
              <p className="mt-2 text-[var(--color-text-muted)]">
                La app de escritorio se sincroniza con tu cuenta web mediante una validacion segura desde el servidor, sin exponer claves ni logica interna.
              </p>
            </div>
            <div className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[#0a0a0b] p-6 font-mono text-xs leading-relaxed text-[var(--color-text-muted)] shadow-[var(--shadow-fluent-lg)]">
              <pre className="overflow-x-auto">
{`validarSesionSegura()
  -> comprobar estado de activacion en servidor
  -> habilitar funciones del plan correspondiente
  -> no exponer claves, tokens ni reglas internas`}
              </pre>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Preguntas frecuentes</h2>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 open:bg-[var(--color-card-hover)]"
              >
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-white">
                  {f.q}
                  <span className="text-[var(--color-text-muted)] transition group-open:rotate-180">
                    <ArrowRight size={16} className="rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-gradient-to-br from-[#0d2b46] via-[#0c1620] to-[var(--color-card)] p-10 text-center shadow-[var(--shadow-fluent-lg)]">
            <p className="text-2xl font-bold text-white sm:text-3xl">
              Listo para acelerar tu PC?
            </p>
            <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">
              Descarga NitroFlow {APP_VERSION} para Windows y pulsa «Analizar mi PC». Crea tu cuenta gratis cuando quieras y sube a Pro si lo necesitas.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DOWNLOAD_URL}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
              >
                <Download size={16} />
                Descargar para Windows
              </a>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-medium text-[#0a0a0b] hover:bg-[var(--color-text-muted)]"
              >
                <HardDrive size={16} />
                Empezar gratis
              </Link>
              <Link
                href="#pricing"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-3 text-sm font-medium text-white hover:border-[var(--color-border-strong)]"
              >
                <Sparkles size={16} />
                Ver Pro
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
