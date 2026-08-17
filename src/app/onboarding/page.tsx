import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes, Building2, PackageOpen, RadioTower, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile } from "@/repositories/users";

const STEPS = [
  { icon: Building2, title: "Dados da empresa", text: "Cadastre remetente, endereço e logo.", href: "/settings?section=general" },
  { icon: PackageOpen, title: "Produtos e curvas", text: "Inclua produtos, custos, medidas e preços.", href: "/products" },
  { icon: RadioTower, title: "Canais de venda", text: "Defina comissões, taxas e ordem dos canais.", href: "/platforms" },
  { icon: Boxes, title: "Embalagens", text: "Cadastre as caixas usadas no cálculo inteligente.", href: "/packaging" }
];

export default async function OnboardingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) redirect("/login");
  return <AppShell isSuperAdmin={profile.is_super_admin} tenantLogoUrl={profile.tenant_logo_url} tenantName={profile.tenant_name} title="Primeiros passos" subtitle="Prepare o ambiente da sua empresa antes de criar o primeiro orçamento."><section className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-5 sm:p-7"><Sparkles className="text-amber-300" size={26} /><h2 className="mt-4 text-2xl font-semibold text-white">Bem-vindo ao Pricing Pro</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">Seu acesso está liberado. Configure apenas o necessário agora; integrações como Olist, Melhor Envio e Correios podem ser conectadas depois.</p></section><div className="mt-5 grid gap-3 md:grid-cols-2">{STEPS.map(({ icon: Icon, ...step }, index) => <Link className="group rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 transition-colors hover:border-amber-400/30 hover:bg-zinc-900" href={step.href} key={step.href}><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-950 text-amber-300"><Icon size={18} /></span><div className="min-w-0"><p className="text-xs text-zinc-600">Etapa {index + 1}</p><h3 className="font-semibold text-white">{step.title}</h3><p className="mt-1 text-sm text-zinc-500">{step.text}</p></div><ArrowRight className="ml-auto mt-2 shrink-0 text-zinc-700 group-hover:text-amber-300" size={17} /></div></Link>)}</div><Link className="focus-ring mt-5 inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-900" href="/dashboard">Ir para o dashboard <ArrowRight size={16} /></Link></AppShell>;
}
