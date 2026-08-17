"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  LockKeyhole,
  MousePointerClick,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  X
} from "lucide-react";

const scenarios = [
  {
    key: "progressive",
    label: "Curva progressiva",
    quantity: "1.000",
    unitPrice: "R$ 1,74",
    margin: "38,2%",
    action: "âncoras sincronizadas",
    points: [72, 62, 54, 48, 42, 38]
  },
  {
    key: "step",
    label: "Preço por faixa",
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
    action: "cotação pronta",
    points: [76, 64, 57, 53, 45, 39]
  }
];

const features = [
  {
    icon: BarChart3,
    title: "Pare de chutar preço",
    text: "Defina curvas por produto e canal, simule ancoragens e enxergue margem antes de enviar o orçamento."
  },
  {
    icon: FileText,
    title: "Orçamento em poucos cliques",
    text: "Gere PDF comercial e texto para WhatsApp com os dados organizados, sem remontar tudo a cada atendimento."
  },
  {
    icon: Truck,
    title: "Frete sem sair da tela",
    text: "Tenha embalagens, Correios, Melhor Envio, etiquetas e rastreio preparados para entrar no fluxo comercial."
  },
  {
    icon: Building2,
    title: "Cada empresa no seu espaço",
    text: "Organize tenants, credenciais, usuários e permissões sem misturar dados ou depender de ajustes manuais."
  },
  {
    icon: ShieldCheck,
    title: "Segurança desde o atendimento",
    text: "Login, convites por token, RLS, auditoria, superadmin e troca de senha deixam a operação mais controlada."
  },
  {
    icon: PackageCheck,
    title: "Cresça além de um produto",
    text: "Inclua botons, chaveiros, espelhos, abridores, ímãs e novas linhas com regras próprias de precificação."
  }
];

const brandStories = [
  {
    name: "Ground Shop",
    relationship: "Cliente",
    image: "/brands/ground-shop.jpeg",
    href: "https://www.groundshop.com.br/",
    description: "Operação de produtos personalizados que deu origem aos primeiros fluxos de precificação, orçamento e frete do Pricing Pro."
  },
  {
    name: "LIA Flow",
    relationship: "Parceiro de tecnologia",
    image: "/brands/lia-flow.png",
    href: "https://liaflow.com.br/",
    description: "Plataforma de automação conversacional integrada ao Pricing Pro para consultar produtos, calcular preços e criar orçamentos durante o atendimento."
  }
] as const;

type BrandStory = (typeof brandStories)[number];

export function LandingPage() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [activeBrand, setActiveBrand] = useState<BrandStory | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const scenario = scenarios[scenarioIndex];

  useEffect(() => {
    if (!activeBrand) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveBrand(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeBrand]);

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
              <span className="block text-xs text-zinc-500">precificação operacional</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              className="focus-ring hidden rounded-md px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/10 sm:inline-flex"
              href="/request-access"
            >
              Experimentar
            </Link>
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
              Tem dificuldade para definir preço e responder rápido?
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Encontre aqui uma ferramenta que acelera seu atendimento e deixa tudo à mão.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Se precificar, calcular desconto progressivo, montar orçamento e conferir frete ainda toma tempo demais,
              o Pricing Pro organiza tudo em poucos cliques: preço, margem, PDF, WhatsApp, produtos, canais e clientes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-400/10 hover:bg-amber-200"
                href="/demo"
              >
                Testar agora no demo
                <ArrowRight size={17} />
              </Link>
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/70 px-5 py-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900"
                href="/request-access"
              >
                Criar ambiente da empresa
              </Link>
            </div>
            <Link className="mt-3 inline-flex text-sm font-medium text-zinc-500 hover:text-white" href="/login">
              Já tenho acesso ao console
            </Link>
            <div className="mt-8 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
              <MiniStat label="Preço com margem" value="na hora" />
              <MiniStat label="PDF + WhatsApp" value="poucos cliques" />
              <MiniStat label="Produtos e frete" value="tudo junto" />
            </div>
          </div>

          <section className="landing-console rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Console demo</p>
                <h2 className="text-lg font-semibold text-white">Veja o preço ganhar forma</h2>
              </div>
              <button
                className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-300/60 hover:text-white"
                onClick={nextScenario}
                type="button"
              >
                Simular outro caso
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
                <ConsoleMetric label="Unitário" value={scenario.unitPrice} />
                <ConsoleMetric label="Margem" value={scenario.margin} />
              </div>

              <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Curva calculada</p>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                    {scenario.action}
                  </span>
                </div>
                <svg className="h-44 w-full overflow-visible" viewBox="0 0 340 130" role="img" aria-label="Gráfico de precificação">
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
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-lg shadow-emerald-500/10 hover:border-emerald-300/70 hover:bg-emerald-400/25"
                  href="/demo"
                >
                  Testar demo pública
                  <ClipboardCheck size={17} />
                </Link>
                <Link
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
                  href="/login"
                >
                  Entrar no sistema
                  <Users size={17} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-900/30 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Clientes e parceiros</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">Marcas que fazem parte dessa evolução.</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Relações construídas entre operação, atendimento e tecnologia. Selecione uma marca para conhecer sua conexão com o Pricing Pro.
              </p>
            </div>
            <p className="text-xs text-zinc-500">Clique em uma marca para ver detalhes</p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {brandStories.map((brand) => (
              <button
                aria-label={`Conhecer ${brand.name}`}
                className="landing-brand group grid min-h-56 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 text-left transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:shadow-2xl hover:shadow-emerald-950/30 focus-ring sm:grid-cols-[220px_minmax(0,1fr)]"
                key={brand.name}
                onClick={() => setActiveBrand(brand)}
                type="button"
              >
                <span className="relative block min-h-52 overflow-hidden border-b border-zinc-800 bg-zinc-900 sm:min-h-full sm:border-b-0 sm:border-r">
                  <Image
                    alt={`Marca ${brand.name}`}
                    className="object-contain p-7 transition duration-500 group-hover:scale-105"
                    fill
                    sizes="(max-width: 640px) 100vw, 220px"
                    src={brand.image}
                  />
                  <span className="landing-brand-shine" />
                </span>
                <span className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    {brand.relationship}
                  </span>
                  <span className="mt-2 text-2xl font-semibold text-white">{brand.name}</span>
                  <span className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">{brand.description}</span>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-200 transition group-hover:text-emerald-200">
                    Conhecer esta parceria
                    <ArrowRight className="transition-transform group-hover:translate-x-1" size={16} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Funcionalidades</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Menos planilha aberta. Mais atendimento fluindo.</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Uma ferramenta para quem precisa responder rápido, manter padrão comercial e ter clareza sobre preço,
            custo, margem e próximos passos do pedido.
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

      {activeBrand ? (
        <BrandStoryModal brand={activeBrand} onClose={() => setActiveBrand(null)} />
      ) : null}
    </main>
  );
}

function BrandStoryModal({ brand, onClose }: { brand: BrandStory; onClose: () => void }) {
  return (
    <div
      aria-labelledby="brand-story-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60">
        <div className="relative h-64 border-b border-zinc-800 bg-zinc-900 sm:h-72">
          <Image
            alt={`Marca ${brand.name}`}
            className="object-contain p-10 sm:p-12"
            fill
            sizes="(max-width: 672px) 100vw, 672px"
            src={brand.image}
          />
          <button
            aria-label="Fechar"
            className="focus-ring absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/90 text-zinc-300 hover:border-zinc-500 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{brand.relationship}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white" id="brand-story-title">{brand.name}</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">{brand.description}</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="focus-ring min-h-10 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              onClick={onClose}
              type="button"
            >
              Fechar
            </button>
            <a
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200"
              href={brand.href}
              rel="noreferrer"
              target="_blank"
            >
              Visitar site
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </div>
    </div>
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
