import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Building2,
  KeyRound,
  PackageOpen,
  PlugZap,
  Settings2,
  Truck
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MelhorEnvioIntegrationPanel } from "@/components/settings/MelhorEnvioIntegrationPanel";
import { CorreiosIntegrationPanel } from "@/components/settings/CorreiosIntegrationPanel";
import { OlistIntegrationPanel } from "@/components/settings/OlistIntegrationPanel";
import { AgentApiKeysPanel } from "@/components/settings/AgentApiKeysPanel";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { TenantSettingsForm } from "@/components/settings/TenantSettingsForm";
import { ArtworkProductionSettings } from "@/components/settings/ArtworkProductionSettings";
import { getCurrentSession } from "@/lib/auth/session";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { getArtworkProductionProfile } from "@/repositories/artwork-production";
import { getSessionProfile } from "@/repositories/users";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    melhor_envio?: string;
    message?: string;
    olist?: string;
    section?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, tenant, artworkProfile] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getTenantShippingProfile(session.userId, session.tenantId),
    getArtworkProductionProfile(session.userId, session.tenantId)
  ]);
  if (!profile || !tenant) redirect("/login");
  const params = await searchParams;
  const activeSection = resolveActiveSection(params);

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Configuracoes"
      subtitle="Dados do tenant, produção, segurança e integrações configuradas separadamente."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <SettingsSubmenu activeSection={activeSection} />
        <div className="min-w-0 max-w-5xl">
          {activeSection === "general" ? <TenantSettingsForm tenant={tenant} /> : null}
          {activeSection === "security" ? <ChangePasswordForm /> : null}
          {activeSection === "melhor-envio" ? (
            <MelhorEnvioIntegrationPanel callbackMessage={params.message} callbackStatus={params.melhor_envio} />
          ) : null}
          {activeSection === "correios" ? <CorreiosIntegrationPanel /> : null}
          {activeSection === "olist" ? <OlistIntegrationPanel /> : null}
          {activeSection === "agents" ? <AgentApiKeysPanel /> : null}
          {activeSection === "production" ? <ArtworkProductionSettings profile={artworkProfile} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

const SETTINGS_GROUPS = [
  {
    label: "Geral",
    items: [
      { id: "general", label: "Dados do tenant", description: "Empresa e remetente", icon: Building2 },
      { id: "security", label: "Segurança", description: "Senha da conta", icon: KeyRound }
    ]
  },
  {
    label: "Integrações",
    items: [
      { id: "melhor-envio", label: "Melhor Envio", description: "OAuth e etiquetas", icon: Truck },
      { id: "correios", label: "Correios", description: "API, PAC e SEDEX", icon: PackageOpen },
      { id: "olist", label: "Olist e CRM", description: "ERP, pedidos e CRM", icon: PlugZap },
      { id: "agents", label: "Agentes e API", description: "Lia Flow e chaves", icon: Bot }
    ]
  },
  {
    label: "Operação",
    items: [
      { id: "production", label: "Produção de artes", description: "Impressão e margens", icon: PackageOpen }
    ]
  }
] as const;

type SettingsSection = (typeof SETTINGS_GROUPS)[number]["items"][number]["id"];

function SettingsSubmenu({ activeSection }: { activeSection: SettingsSection }) {
  return (
    <aside className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 lg:sticky lg:top-5">
      <div className="mb-2 hidden items-center gap-2 px-3 pt-2 text-xs font-semibold uppercase text-zinc-500 lg:flex">
        <Settings2 size={14} />
        Configurações
      </div>
      <nav aria-label="Seções das configurações" className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:grid lg:gap-4 lg:overflow-visible lg:pb-0">
        {SETTINGS_GROUPS.map((group) => (
          <div className="flex shrink-0 gap-2 lg:grid lg:gap-1" key={group.label}>
            <p className="hidden px-3 py-1 text-[11px] font-semibold uppercase text-zinc-600 lg:block">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`focus-ring group flex min-w-fit items-center gap-2 rounded-md border px-3 py-2.5 transition-colors lg:min-w-0 ${
                    active
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                      : "border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-950/60 hover:text-white"
                  }`}
                  href={`/settings?section=${item.id}`}
                  key={item.id}
                >
                  <Icon className={active ? "text-amber-300" : "text-zinc-600 group-hover:text-zinc-300"} size={17} />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-sm font-medium">{item.label}</span>
                    <span className="hidden truncate text-[11px] text-zinc-600 lg:block">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function resolveActiveSection(params: { melhor_envio?: string; olist?: string; section?: string }): SettingsSection {
  const validSections = new Set<string>(SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id)));
  if (params.section && validSections.has(params.section)) return params.section as SettingsSection;
  if (params.melhor_envio) return "melhor-envio";
  if (params.olist) return "olist";
  return "general";
}
