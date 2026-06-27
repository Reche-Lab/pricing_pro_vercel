import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { QuoteStatusActions } from "@/components/quotes/QuoteStatusActions";
import { QuoteWhatsAppButton } from "@/components/quotes/QuoteWhatsAppButton";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { listQuoteShipments } from "@/repositories/shipments";
import { getSessionProfile } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { quoteId } = await params;
  const [profile, detail, shipments] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    listQuoteShipments(session.userId, session.tenantId, quoteId)
  ]);

  if (!profile) redirect("/login");
  if (!detail) notFound();

  return (
    <AppShell title="Orcamento" subtitle={`Status: ${detail.quote.status}`} tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="grid gap-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-500">Cliente</p>
                <h2 className="text-xl font-semibold text-zinc-950">
                  {detail.quote.customer_name ?? "Cliente nao informado"}
                </h2>
                <p className="text-sm text-zinc-500">
                  {[detail.quote.customer_email, detail.quote.customer_phone].filter(Boolean).join(" - ")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-500">Total</p>
                <p className="text-2xl font-semibold text-zinc-950">{brl.format(Number(detail.quote.grand_total))}</p>
              </div>
            </div>
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="font-semibold">Itens</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {detail.items.map((item) => (
                <div className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[1fr_auto]" key={item.id}>
                  <div>
                    <p className="font-medium text-zinc-950">{item.description}</p>
                    <p className="text-zinc-500">
                      {item.quantity} x {brl.format(Number(item.unit_price))}
                    </p>
                  </div>
                  <p className="font-semibold text-zinc-950">{brl.format(Number(item.total_price))}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="font-semibold">Envios vinculados</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {shipments.length === 0 ? (
                <p className="p-5 text-sm text-zinc-500">Nenhum envio vinculado ainda.</p>
              ) : (
                shipments.map((shipment) => (
                  <div className="grid gap-1 px-5 py-4 text-sm" key={shipment.id}>
                    <p className="font-medium text-zinc-950">
                      {shipment.provider} - {shipment.status}
                    </p>
                    <p className="text-zinc-500">
                      {shipment.service_name ?? shipment.service_code ?? "Servico nao informado"} -{" "}
                      {brl.format(Number(shipment.shipping_amount))}
                    </p>
                    {shipment.tracking_code ? <p className="text-zinc-500">Rastreio: {shipment.tracking_code}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <aside className="grid h-fit gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">Acoes</h2>
            <div className="mt-4 grid gap-4">
              <QuoteWhatsAppButton quoteId={quoteId} />
              <QuoteStatusActions quoteId={quoteId} />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">Resumo</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <Detail label="Subtotal" value={brl.format(Number(detail.quote.subtotal))} />
              <Detail label="Frete" value={brl.format(Number(detail.quote.shipping_total))} />
              <Detail label="Desconto" value={brl.format(Number(detail.quote.discount_total))} />
              <Detail label="Margem" value={`${Number(detail.quote.margin_percent).toFixed(1)}%`} />
              <Detail label="Validade" value={detail.quote.valid_until ?? "-"} />
            </dl>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-950">{value}</dd>
    </div>
  );
}
