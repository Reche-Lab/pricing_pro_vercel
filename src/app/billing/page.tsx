import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { BillingPanel } from "@/components/billing/BillingPanel";
import { getCurrentSession } from "@/lib/auth/session";
import { getBillingOverview } from "@/repositories/billing";
import { getSessionProfile } from "@/repositories/users";

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, billing, params] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getBillingOverview(session.userId, session.tenantId),
    searchParams
  ]);

  if (!profile || !billing) redirect("/login");

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Assinatura"
      subtitle="Cobrança mensal do tenant via Mercado Pago."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <BillingPanel billing={billing} returnStatus={params.status} />
    </AppShell>
  );
}
