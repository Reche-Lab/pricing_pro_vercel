import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SuperadminPanel } from "@/components/superadmin/SuperadminPanel";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin, listSuperadminTenants, listSuperadminUsers } from "@/repositories/superadmin";
import { getSessionProfile } from "@/repositories/users";

export default async function SuperadminPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, allowed] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    isSuperAdmin(session.userId)
  ]);
  if (!profile) redirect("/login");
  if (!allowed) redirect("/dashboard");

  const [tenants, users] = await Promise.all([listSuperadminTenants(), listSuperadminUsers()]);

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Superadmin"
      subtitle="Visão global restrita ao administrador do sistema."
      tenantName={profile.tenant_name}
    >
      <SuperadminPanel tenants={tenants} users={users} />
    </AppShell>
  );
}
