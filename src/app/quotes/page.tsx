import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { QuoteForm } from "@/components/quotes/QuoteForm";
import { getCurrentSession } from "@/lib/auth/session";
import { listCustomers } from "@/repositories/customers";
import { listPlatformRules } from "@/repositories/platforms";
import { listProductVariants } from "@/repositories/products";
import { listQuotes } from "@/repositories/quotes";
import { getSessionProfile } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function QuotesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants, platforms, customers, quotes] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId),
    listPlatformRules(session.userId, session.tenantId),
    listCustomers(session.userId, session.tenantId),
    listQuotes(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Orcamentos" subtitle="Orcamentos persistidos com snapshot de calculo." tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
        <QuoteForm
          customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
          platforms={platforms.map((platform) => ({ id: platform.id, name: platform.name }))}
          variants={variants.map((variant) => ({
            id: variant.variant_id,
            label: `${variant.product_name} - ${variant.variant_name}`
          }))}
        />

        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="font-semibold">Orcamentos recentes</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {quotes.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum orcamento criado ainda.</p>
            ) : (
              quotes.map((quote) => (
                <div className="grid gap-1 px-5 py-4 text-sm md:grid-cols-[1fr_auto] md:items-center" key={quote.id}>
                  <div>
                    <p className="font-medium text-zinc-950">{quote.customer_name ?? "Cliente nao informado"}</p>
                    <p className="text-zinc-500">
                      Status: {quote.status} - Margem: {Number(quote.margin_percent).toFixed(1)}%
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-zinc-950">{brl.format(Number(quote.grand_total))}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
