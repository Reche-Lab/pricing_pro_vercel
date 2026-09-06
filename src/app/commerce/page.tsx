import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CommerceAdmin } from "@/components/commerce/CommerceAdmin";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile } from "@/repositories/users";
import { commerceEnabled, getCommerceAdmin } from "@/repositories/commerce";
export const dynamic = "force-dynamic";
export default async function CommercePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) redirect("/login");
  if (!profile.is_super_admin && !["owner", "admin"].includes(profile.role))
    redirect("/dashboard");
  return (
    <AppShell
      title="Loja online"
      subtitle="Módulo opcional · catálogo, personalização e pedidos independentes do ERP."
      tenantName={profile.tenant_name}
      tenantLogoUrl={profile.tenant_logo_url}
      isSuperAdmin={profile.is_super_admin}
    >
      {commerceEnabled() ? (
        <CommerceAdmin
          initial={await getCommerceAdmin(session.userId, session.tenantId)}
          tenantName={profile.tenant_name}
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Módulo de loja ainda desativado
          </h2>
          <p className="max-w-2xl text-zinc-400">
            O precificador e os orçamentos continuam funcionando normalmente.
            Para iniciar o piloto, aplique a migration
            0062_optional_commerce.sql e configure COMMERCE_ENABLED=true no
            ambiente.
          </p>
          <Link
            href="/settings"
            className="inline-block text-amber-300 underline"
          >
            Voltar às configurações
          </Link>
        </div>
      )}
    </AppShell>
  );
}
