import { redirect } from "next/navigation";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { listCustomers } from "@/repositories/customers";
import { getSessionProfile } from "@/repositories/users";

export default async function CustomersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, customers] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listCustomers(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Clientes" subtitle="Clientes isolados por tenant." tenantName={profile.tenant_name}>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <CustomerForm />
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="font-semibold">Clientes recentes</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {customers.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum cliente cadastrado ainda.</p>
            ) : (
              customers.map((customer) => (
                <div className="grid gap-1 px-5 py-4 text-sm" key={customer.id}>
                  <p className="font-medium text-white">{customer.name}</p>
                  <p className="text-zinc-500">
                    {[
                      customer.email,
                      customer.phone,
                      customer.postal_code,
                      customer.city,
                      customer.state
                    ].filter(Boolean).join(" - ") ||
                      "Sem dados adicionais"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
