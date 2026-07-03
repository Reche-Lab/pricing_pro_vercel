import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { MelhorEnvioPayloadPreview } from "@/components/quotes/MelhorEnvioPayloadPreview";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";
import { QuoteStatusActions } from "@/components/quotes/QuoteStatusActions";
import { QuoteWhatsAppButton } from "@/components/quotes/QuoteWhatsAppButton";
import { PublicQuoteLinkButton } from "@/components/quotes/PublicQuoteLinkButton";
import { MelhorEnvioShipmentActions } from "@/components/shipments/MelhorEnvioShipmentActions";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { listQuoteShipments } from "@/repositories/shipments";
import { getSessionProfile, listTenantMembers } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { quoteId } = await params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) notFound();

  const [profile, detail, shipments, members] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    listQuoteShipments(session.userId, session.tenantId, quoteId),
    listTenantMembers(session.userId, session.tenantId)
  ]);

  if (!profile) redirect("/login");
  if (!detail) notFound();

  return (
    <AppShell
      title="Orcamento"
      subtitle={`Status: ${detail.quote.status}`}
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(560px,1.2fr)] 2xl:grid-cols-[minmax(360px,0.75fr)_minmax(720px,1.25fr)]">
        <section className="grid h-fit gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="grid gap-4">
              <div>
                <p className="text-sm text-zinc-500">Cliente</p>
                <h2 className="text-lg font-semibold text-white">
                  {detail.quote.customer_name ?? "Cliente nao informado"}
                </h2>
                <p className="text-sm text-zinc-500">
                  {[detail.quote.customer_email, detail.quote.customer_phone].filter(Boolean).join(" - ")}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-semibold">Resumo</h2>
                <p className="text-xs text-zinc-500">Totais deste orçamento</p>
              </div>
              <p className="text-xl font-semibold text-white">{brl.format(Number(detail.quote.grand_total))}</p>
            </div>
            <dl className="grid gap-2 text-sm">
              <Detail label="Subtotal" value={brl.format(Number(detail.quote.subtotal))} />
              <Detail label="Frete" value={brl.format(Number(detail.quote.shipping_total))} />
              <Detail label="Desconto" value={brl.format(Number(detail.quote.discount_total))} />
              <Detail label="Margem" value={`${Number(detail.quote.margin_percent).toFixed(1)}%`} />
              <Detail label="Validade" value={formatDate(detail.quote.valid_until)} />
            </dl>
          </div>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="font-semibold">Itens</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {detail.items.map((item) => (
                <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]" key={item.id}>
                  <div>
                    <p className="font-medium text-white">{item.description}</p>
                    <p className="text-zinc-500">
                      {item.quantity} x {brl.format(Number(item.unit_price))}
                    </p>
                    {item.artwork_name ? <p className="text-zinc-500">Arte: {item.artwork_name}</p> : null}
                    {item.reference_quantity ? (
                      <p className="text-xs text-amber-300">
                        Qtd. de referencia: {item.reference_quantity} · {formatPricingRule(item.pricing_rule)}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold text-white">{brl.format(Number(item.total_price))}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="font-semibold">Envios vinculados</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {shipments.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">Nenhum envio vinculado ainda.</p>
              ) : (
                shipments.map((shipment) => (
                  <div className="grid gap-1 px-4 py-3 text-sm" key={shipment.id}>
                    <p className="font-medium text-white">
                      {shipment.provider} - {shipment.status}
                    </p>
                    <p className="text-zinc-500">
                      {shipment.service_name ?? shipment.service_code ?? "Servico nao informado"} -{" "}
                      {brl.format(Number(shipment.shipping_amount))}
                    </p>
                    {shipment.tracking_code ? <p className="text-zinc-500">Rastreio: {shipment.tracking_code}</p> : null}
                    {shipment.provider === "melhor_envio" ? (
                      <MelhorEnvioShipmentActions shipmentId={shipment.id} />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <MelhorEnvioPayloadPreview quoteId={quoteId} />
        </section>

        <aside className="grid h-fit gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-semibold">Acoes</h2>
                <p className="text-sm text-zinc-500">Gere documentos, compartilhe e envie o orçamento para integrações.</p>
              </div>
              <p className="text-lg font-semibold text-white">{brl.format(Number(detail.quote.grand_total))}</p>
            </div>
            <div className="mt-5 grid gap-5">
              <div className="grid gap-3 md:grid-cols-3">
              <Link
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60"
                href={`/api/quotes/${quoteId}/pdf`}
              >
                Baixar PDF
              </Link>
              <QuoteWhatsAppButton quoteId={quoteId} />
              <PublicQuoteLinkButton quoteId={quoteId} />
              </div>
              <OlistQuoteActions
                customerDocument={detail.quote.customer_document}
                customerEmail={detail.quote.customer_email}
                customerLocalCode={detail.quote.customer_id}
                customerName={detail.quote.customer_name}
                customerPhone={detail.quote.customer_phone}
                externalCrmId={detail.quote.external_crm_id}
                externalInvoiceId={detail.quote.external_olist_invoice_id}
                externalOlistId={detail.quote.customer_external_olist_id}
                externalOrderId={detail.quote.external_olist_order_id}
                hasCustomer={Boolean(detail.quote.customer_id)}
                quoteId={quoteId}
                responsibleUsers={members
                  .filter((member) => member.member_status === "active" && member.external_olist_user_id)
                  .map((member) => ({
                    id: member.external_olist_user_id as string,
                    name: member.name,
                    email: member.email
                  }))}
              />
              <QuoteStatusActions quoteId={quoteId} />
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function formatPricingRule(rule: string | null | undefined) {
  if (rule === "per_art_average") return "por artes do mesmo produto";
  if (rule === "aggregate_total") return "por total do mesmo produto";
  return "por item individual";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}
