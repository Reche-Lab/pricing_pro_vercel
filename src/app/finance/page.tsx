import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { getFinancialOverview } from "@/repositories/finance";
import { getSessionProfile } from "@/repositories/users";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ competence?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const competence = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.competence ?? "")
    ? params.competence!
    : new Date().toISOString().slice(0, 7);
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) redirect("/login");
  const isTenantAdmin = profile.is_super_admin || profile.role === "owner" || profile.role === "admin";
  if (!isTenantAdmin) redirect("/dashboard");
  const overview = await getFinancialOverview(session.userId, session.tenantId, competence);
  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Financeiro"
      subtitle="Extratos, classificação, transferências internas e visão gerencial do caixa."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <FinanceWorkspace initialOverview={overview} />
    </AppShell>
  );
}
