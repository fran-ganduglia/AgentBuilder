import Link from "next/link";

const highlights = [
  "Onboarding guiado para equipos no técnicos",
  "Seguridad multi-tenant pensada desde el día 1",
  "Flujos con IA, documentos y automatizaciones en un solo lugar",
];

const featureCards = [
  {
    title: "Diseña agentes como si crearas un personaje",
    description:
      "Define tono, reglas, herramientas y documentos con una interfaz clara para negocio, operaciones o soporte.",
    icon: (
      <svg
        className="h-6 w-6 text-emerald-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "Controla costos y uso sin hojas sueltas",
    description:
      "Mide mensajes, tokens y límites del plan desde un dashboard único para toda la organización.",
    icon: (
      <svg
        className="h-6 w-6 text-amber-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    title: "Activa integraciones sin exponer secretos",
    description:
      "Centraliza webhooks, credenciales y permisos desde el backend para mantener aislada cada organización.",
    icon: (
      <svg
        className="h-6 w-6 text-indigo-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
];

const metrics = [
  { value: "3", label: "Planes listos para empezar" },
  { value: "1", label: "Dashboard para operar todo" },
  { value: "0", label: "Dependencia de equipo técnico" },
];

export default function Home() {
  const primaryHref = "/register";
  const primaryLabel = "Empezar gratis";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-50 selection:bg-emerald-200 selection:text-emerald-900">
      {/* Background patterns */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-slate-50 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-emerald-500 opacity-20 blur-[100px]"></div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pt-6 sm:px-8 lg:px-10">
        <header className="relative z-50 flex items-center justify-between rounded-full border border-white/80 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-md">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm">
              AB
            </span>
            <div className="hidden sm:block">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                AgentBuilder
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Para equipos reales
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
            >
              Iniciar sesión
            </Link>
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              {primaryLabel}
            </Link>
          </nav>
        </header>

        <section className="mt-12 grid flex-1 gap-12 pb-16 lg:mt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:pb-24">
          {/* Left Column */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              SaaS B2B para crear agentes sin depender de desarrollo
            </div>

            <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-slate-950 sm:text-6xl lg:text-[4rem] lg:leading-[1.1]">
              Convierte procesos en{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                agentes útiles
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Diseña asistentes para soporte, ventas u operaciones con una experiencia visual clara,
              control de seguridad desde backend y una base lista para crecer con tu empresa.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                {primaryLabel}
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
              >
                Ya tengo cuenta
              </Link>
            </div>

            <ul className="mt-10 grid gap-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-2">
              {highlights.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/80"
                >
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right Column: Preview window */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            {/* Soft glows behind the window */}
            <div className="absolute -left-4 top-10 -z-10 h-32 w-32 rounded-full bg-emerald-300/40 blur-3xl sm:-left-10" />
            <div className="absolute -right-4 bottom-10 -z-10 h-40 w-40 rounded-full bg-amber-300/30 blur-3xl sm:-right-10" />

            <div className="relative flex flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-900/40 ring-1 ring-white/10">
              {/* Fake Chrome window controls */}
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-5 py-3.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80"></div>
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80"></div>
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80"></div>
                <div className="ml-4 flex flex-1 justify-center">
                  <div className="h-4 w-32 rounded-full bg-white/5"></div>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                      Vista previa
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Dashboard de operación</h2>
                  </div>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                    Seguro por organización
                  </span>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="flex flex-col rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10"
                    >
                      <p className="text-3xl font-bold text-white">{metric.value}</p>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        {metric.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-inner shadow-black/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-slate-400">
                        Agente destacado
                      </p>
                      <p className="mt-1 text-lg font-semibold text-white">Soporte LATAM</p>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                      Activo
                    </span>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="rounded-xl border border-white/5 bg-slate-950 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Personalidad
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        Cercano, claro y orientado a resolver incidencias sin escalar ruido
                        innecesario.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-slate-950 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Conocimiento
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        Documentación interna, FAQ, playbooks y webhooks para avisos operativos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 lg:py-24">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <article
                key={feature.title}
                className="group relative flex flex-col items-start rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/50"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 transition-colors group-hover:bg-slate-100">
                  {feature.icon}
                </div>
                <h3 className="mt-6 text-xl font-bold leading-snug text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="relative mt-16 overflow-hidden rounded-[2.5rem] border border-slate-800 bg-slate-950 px-8 py-16 text-white shadow-2xl sm:px-16 sm:py-20 lg:mt-24 lg:py-24">
            {/* Background glowing effects */}
            <div className="absolute left-1/2 top-0 -z-10 h-64 w-[80%] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[100px]" />
            <div className="absolute bottom-0 right-0 -z-10 h-40 w-40 rounded-full bg-amber-500/10 blur-[80px]" />

            <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  Acceso controlado
                </p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  La landing ahora te lleva a elegir cómo entrar, sin reutilizar sesiones por accidente.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  Mantuvimos visibles crear cuenta e iniciar sesión, pero el acceso vuelve a pedir confirmación si ya había una sesión previa en el navegador.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-4 sm:flex-row lg:flex-col xl:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-sm font-bold text-slate-900 shadow-lg transition-all hover:scale-105 hover:bg-slate-100 active:scale-95"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-bold text-white transition-all hover:scale-105 hover:border-white/30 hover:bg-white/10 active:scale-95"
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
