import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { UserManagementPanel } from "@/components/users/UserManagementPanel";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile, listRoles, listTenantMembers, userHasPermission } from "@/repositories/users";

export default async function UsersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, allowed, members, roles] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    listTenantMembers(session.userId, session.tenantId),
    listRoles(session.userId, session.tenantId)
  ]);

  if (!profile) redirect("/login");

  return (
    <AppShell
      isSuperAdmin={profile.is_super_admin}
      title="Usuarios"
      subtitle="Membros e permissoes por tenant."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      {allowed ? (
        <UserManagementPanel
          currentRole={profile.role}
          currentUserId={session.userId}
          members={members}
          roles={roles}
        />
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 text-sm text-zinc-400">
          Seu usuario nao tem permissao para gerenciar membros.
        </div>
      )}
    </AppShell>
  );
}
