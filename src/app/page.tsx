import Link from "next/link";

const highlights = [
  "Onboarding guiado para equipos no tecnicos",
  "Seguridad multi-tenant pensada desde el dia 1",
  "Flujos con IA, documentos y automatizaciones en un solo lugar",
];

const featureCards = [
  {
    title: "Disena agentes como si crearas un personaje",
    description:
      "Define tono, reglas, herramientas y documentos con una interfaz clara para negocio, operaciones o soporte.",
  },
  {
    title: "Controla costos y uso sin hojas sueltas",
    description:
      "Mide mensajes, tokens y limites del plan desde un dashboard unico para toda la organizacion.",
  },
  {
    title: "Activa integraciones sin exponer secretos",
    description:
      "Centraliza webhooks, credenciales y permisos desde el backend para mantener aislada cada organizacion.",
  },
];

const metrics = [
  { value: "3", label: "planes listos para empezar" },
  { value: "1", label: "dashboard para operar todo" },
  { value: "0", label: "dependencia de equipo tecnico" },
];

export default function Home() {
  const primaryHref = "/register";
  const primaryLabel = "Empezar gratis";

  return (
    <main className="relative overflow-hidden bg-stone-50">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.22),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(248,246,242,1))]" />
      <div className="absolute left-8 top-24 -z-10 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="absolute right-0 top-40 -z-10 h-56 w-56 rounded-full bg-amber-200/50 blur-3xl" />

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/75 px-4 py-3 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-stone-50">
              AB
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
                AgentBuilder
              </p>
              <p className="text-xs text-slate-500">Agentes de IA para equipos reales</p>
            </div>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Iniciar sesion
            </Link>
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {primaryLabel}
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
              SaaS B2B para crear agentes sin depender de desarrollo
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-tight text-slate-950 sm:text-6xl">
              Convierte procesos internos en agentes utiles y faciles de operar.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Disena asistentes para soporte, ventas u operaciones con una experiencia visual clara,
              control de seguridad desde backend y una base lista para crecer con tu empresa.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                Ya tengo cuenta
              </Link>
            </div>

            <ul className="mt-8 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
              {highlights.map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-white/80 bg-white/80 px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -left-6 top-10 hidden h-24 w-24 rounded-full bg-emerald-200/60 blur-2xl sm:block" />
            <div className="absolute -right-2 bottom-10 hidden h-28 w-28 rounded-full bg-amber-200/70 blur-2xl sm:block" />

            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-900 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-emerald-300">
                    Vista previa
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold">Dashboard de operacion</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                  Seguro por organizacion
                </span>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                    <p className="text-3xl font-semibold text-white">{metric.value}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{metric.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.5rem] bg-white p-5 text-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Agente destacado</p>
                    <p className="mt-1 text-xl font-semibold">Soporte LATAM</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    activo
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl bg-stone-100 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Personalidad</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Cercano, claro y orientado a resolver incidencias sin escalar ruido innecesario.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-stone-100 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conocimiento</p>
                    <p className="mt-2 text-sm text-slate-700">
                      Documentacion interna, FAQ, playbooks y webhooks para avisos operativos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16">
          <div className="grid gap-5 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]"
              >
                <div className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Feature
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-slate-950">{feature.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-900 px-8 py-8 text-white shadow-[0_18px_60px_rgba(15,23,42,0.16)] sm:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm uppercase tracking-[0.24em] text-amber-300">Acceso controlado</p>
                <h2 className="mt-3 text-3xl font-semibold">
                  La landing ahora te lleva a elegir como entrar, sin reutilizar sesiones por accidente.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Mantuvimos visibles crear cuenta e iniciar sesion, pero el acceso vuelve a pedir confirmacion si ya habia una sesion previa en el navegador.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-stone-100"
                >
                  Iniciar sesion
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Crear cuenta
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
