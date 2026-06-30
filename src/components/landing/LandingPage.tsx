"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  MousePointerClick,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Users
} from "lucide-react";

const scenarios = [
  {
    key: "progressive",
    label: "Curva progressiva",
    quantity: "1.000",
    unitPrice: "R$ 1,74",
    margin: "38,2%",
    action: "ancoras sincronizadas",
    points: [72, 62, 54, 48, 42, 38]
  },
  {
    key: "step",
    label: "Preco por faixa",
    quantity: "250",
    unitPrice: "R$ 2,19",
    margin: "34,7%",
    action: "faixas por canal",
    points: [78, 78, 58, 58, 44, 44]
  },
  {
    key: "shipping",
    label: "Frete + embalagem",
    quantity: "600",
    unitPrice: "R$ 1,91",
    margin: "36,8%",
    action: "cotacao pronta",
    points: [76, 64, 57, 53, 45, 39]
  }
];

const features = [
  {
    icon: BarChart3,
    title: "Precificacao inteligente",
    text: "Curvas por produto e canal, faixas estaveis, ancoragens editaveis e simulacoes sem alterar o cadastro."
  },
  {
    icon: FileText,
    title: "Orcamentos prontos",
    text: "PDF comercial, texto para WhatsApp, orcamento composto por artes e snapshot dos calculos."
  },
  {
    icon: Truck,
    title: "Frete integrado",
    text: "Embalagens, Correios, Melhor Envio, etiquetas, rastreio e fluxo preparado para operacao real."
  },
  {
    icon: Building2,
    title: "Multi-tenant",
    text: "Empresas isoladas, configuracoes e credenciais por tenant, usuarios e permissoes por papel."
  },
  {
    icon: ShieldCheck,
    title: "Seguranca aplicada",
    text: "Login, convites por token, RLS no banco, auditoria, superadmin e troca segura de senha."
  },
  {
    icon: PackageCheck,
    title: "Produtos flexiveis",
    text: "Botons, chaveiros, espelhos, abridores, imas e novos produtos com suas proprias regras."
  }
];

export function LandingPage() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [pulse, setPulse] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const scenario = scenarios[scenarioIndex];

  const path = useMemo(() => {
    const width = 340;
    const step = width / (scenario.points.length - 1);
    return scenario.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${Math.round(index * step)} ${point}`)
      .join(" ");
  }, [scenario.points]);

  function moveHero(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    heroRef.current?.style.setProperty("--mx", `${x}%`);
    heroRef.current?.style.setProperty("--my", `${y}%`);
  }

  function nextScenario() {
    setScenarioIndex((current) => (current + 1) % scenarios.length);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 520);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <section
        className="landing-hero relative min-h-screen border-b border-zinc-800"
        onMouseMove={moveHero}
        ref={heroRef}
      >
        <div className="landing-grid" />
        <div className="landing-scan" />

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link className="group inline-flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-amber-300/40 bg-amber-300 text-zinc-950 shadow-lg shadow-amber-400/10">
              <Sparkles size={20} />
            </span>
            <span>
              <span className="block text-base font-semibold text-white">Pricing Pro</span>
              <span className="block text-xs text-zinc-500">precificacao operacional</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              className="focus-ring hidden rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white sm:inline-flex"
              href="/demo"
            >
              Console demo
            </Link>
            <Link
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm font-semibold text-white hover:border-amber-300/60 hover:bg-zinc-900"
              href="/login"
            >
              <LockKeyhole size={16} />
              Login
            </Link>
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-82px)] max-w-7xl items-center gap-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[1fr_520px] lg:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-zinc-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <MousePointerClick size={14} />
              Passe o mouse, clique no console e simule cenarios
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              O cockpit futurista para vender produtos personalizados com preco certo.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Precificacao progressiva, orcamentos compostos, frete, canais, usuarios, tenants e integracoes em uma
              operacao moderna, segura e pronta para crescer.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-400/10 hover:bg-amber-200"
                href="/demo"
              >
                Abrir console demo
                <ArrowRight size={17} />
              </Link>
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/70 px-5 py-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900"
                href="/login"
              >
                Entrar na area segura
              </Link>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
              <MiniStat label="Tenants isolados" value="multi" />
              <MiniStat label="PDF + WhatsApp" value="1 clique" />
              <MiniStat label="Frete e CRM" value="integrado" />
            </div>
          </div>

          <section className="landing-console rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Console demo</p>
                <h2 className="text-lg font-semibold text-white">Simulador comercial</h2>
              </div>
              <button
                className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-300/60 hover:text-white"
                onClick={nextScenario}
                type="button"
              >
                Alternar cenario
              </button>
            </div>

            <div className={`grid gap-4 ${pulse ? "landing-pulse" : ""}`}>
              <div className="grid grid-cols-3 gap-2">
                {scenarios.map((item, index) => (
                  <button
                    className={[
                      "focus-ring rounded-md border px-3 py-2 text-left text-xs transition-transform hover:-translate-y-0.5",
                      index === scenarioIndex
                        ? "border-amber-300/70 bg-amber-300 text-zinc-950"
                        : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-white"
                    ].join(" ")}
                    key={item.key}
                    onClick={() => setScenarioIndex(index)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <ConsoleMetric label="Qtd." value={scenario.quantity} />
                <ConsoleMetric label="Unitario" value={scenario.unitPrice} />
                <ConsoleMetric label="Margem" value={scenario.margin} />
              </div>

              <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Curva calculada</p>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                    {scenario.action}
                  </span>
                </div>
                <svg className="h-44 w-full overflow-visible" viewBox="0 0 340 130" role="img" aria-label="Grafico de precificacao">
                  <path d="M 0 100 H 340 M 0 70 H 340 M 0 40 H 340" stroke="#27272a" strokeWidth="1" />
                  <path d={path} fill="none" stroke="#fcd34d" strokeLinecap="round" strokeWidth="4" />
                  {scenario.points.map((point, index) => (
                    <circle
                      className="landing-anchor"
                      cx={(340 / (scenario.points.length - 1)) * index}
                      cy={point}
                      fill={index % 2 === 0 ? "#34d399" : "#fcd34d"}
                      key={`${point}-${index}`}
                      r="5"
                    />
                  ))}
                </svg>
                <div className="grid grid-cols-4 gap-2 text-xs text-zinc-500">
                  <span>1 un.</span>
                  <span>50</span>
                  <span>500</span>
                  <span className="text-right">1000+</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white"
                  href="/demo"
                >
                  Testar demo publica
                  <ClipboardCheck size={17} />
                </Link>
                <Link
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
                  href="/login"
                >
                  Acessar login
                  <Users size={17} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Funcionalidades</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Tudo que uma operacao de orcamento precisa.</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            O sistema saiu do HTML isolado para uma plataforma multi-tenant com regras de negocio, seguranca e
            integracoes pensadas para manutencao.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article
              className="landing-feature group rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 transition-transform hover:-translate-y-1 hover:border-amber-300/40"
              key={feature.title}
            >
              <feature.icon className="text-amber-300 transition-transform group-hover:scale-110" size={22} />
              <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function ConsoleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
