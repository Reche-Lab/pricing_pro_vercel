import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { MelhorEnvioIntegrationPanel } from "@/components/settings/MelhorEnvioIntegrationPanel";
import { OlistIntegrationPanel } from "@/components/settings/OlistIntegrationPanel";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { TenantSettingsForm } from "@/components/settings/TenantSettingsForm";
import { getCurrentSession } from "@/lib/auth/session";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { getSessionProfile } from "@/repositories/users";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ melhor_envio?: string; message?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, tenant] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getTenantShippingProfile(session.userId, session.tenantId)
  ]);
  if (!profile || !tenant) redirect("/login");
  const params = await searchParams;

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Configuracoes"
      subtitle="Dados usados em documentos, remetente de frete e integracoes."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <div className="grid max-w-5xl gap-6">
        <ChangePasswordForm />
        <MelhorEnvioIntegrationPanel callbackMessage={params.message} callbackStatus={params.melhor_envio} />
        <OlistIntegrationPanel />
        <TenantSettingsForm tenant={tenant} />
      </div>
    </AppShell>
  );
}
