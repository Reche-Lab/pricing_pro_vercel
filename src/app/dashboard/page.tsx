import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { countCustomers } from "@/repositories/customers";
import { getSessionProfile } from "@/repositories/users";
import { listProductVariants } from "@/repositories/products";
import { countQuotes } from "@/repositories/quotes";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants, customersCount, quotesCount] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId),
    countCustomers(session.userId, session.tenantId),
    countQuotes(session.userId, session.tenantId)
  ]);

  if (!profile) redirect("/login");

  return (
    <AppShell
      title="Dashboard"
      subtitle="Base multi-tenant inicial com produtos e usuarios por tenant."
      tenantName={profile.tenant_name}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Tenant" value={profile.tenant_name} />
        <Card label="Usuario" value={profile.name} />
        <Card label="Variantes cadastradas" value={String(variants.length)} />
        <Card label="Clientes" value={String(customersCount)} />
        <Card label="Orcamentos" value={String(quotesCount)} />
      </section>
    </AppShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
