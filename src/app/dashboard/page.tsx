import { redirect } from "next/navigation";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { getBillingOverview } from "@/repositories/billing";
import { getDashboardOverview } from "@/repositories/dashboard";
import { getSessionProfile } from "@/repositories/users";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, overview, billing] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getDashboardOverview(session.userId, session.tenantId),
    getBillingOverview(session.userId, session.tenantId)
  ]);

  if (!profile) redirect("/login");

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Dashboard"
      subtitle="Visão operacional do atendimento, orçamentos, frete, integrações e saúde do tenant."
      tenantName={profile.tenant_name}
    >
      <DashboardOverview data={overview} billing={billing} />
    </AppShell>
  );
}
