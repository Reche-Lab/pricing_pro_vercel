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
      <div className="grid gap-6 xl:grid-cols-[minmax(520px,640px)_1fr]">
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
                <div className="grid gap-2 px-5 py-4 text-sm" key={customer.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{customer.name}</p>
                    {customer.document ? (
                      <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-xs text-zinc-400">
                        {customer.document}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-1 text-zinc-500">
                    <p>{[customer.email, customer.phone].filter(Boolean).join(" - ") || "Sem contato cadastrado"}</p>
                    <p>
                      {[
                        customer.address_line,
                        customer.address_number,
                        customer.address_complement,
                        customer.district,
                        customer.city,
                        customer.state,
                        customer.postal_code
                      ].filter(Boolean).join(" - ") || "Sem endereço cadastrado"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
