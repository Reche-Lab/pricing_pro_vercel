import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Edit3 } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { DeleteQuoteButton } from "@/components/quotes/DeleteQuoteButton";
import { MelhorEnvioQuoteLabelActions } from "@/components/quotes/MelhorEnvioQuoteLabelActions";
import { MelhorEnvioPayloadPreview } from "@/components/quotes/MelhorEnvioPayloadPreview";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";
import { QuoteEditPanel, QuoteItemEditPanel } from "@/components/quotes/QuoteEditPanel";
import { QuotePaymentTermPanel } from "@/components/quotes/QuotePaymentTermPanel";
import { QuoteStatusActions } from "@/components/quotes/QuoteStatusActions";
import { QuoteWhatsAppButton } from "@/components/quotes/QuoteWhatsAppButton";
import { PublicQuoteLinkButton } from "@/components/quotes/PublicQuoteLinkButton";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail, listQuoteEditLogs } from "@/repositories/quotes";
import { getQuotePaymentTerm, listOlistPaymentOptions } from "@/repositories/olist-payment-options";
import { getIntegrationConnection } from "@/repositories/integrations";
import { listProductVariants } from "@/repositories/products";
import { listQuoteShipments } from "@/repositories/shipments";
import { getSessionProfile, listTenantMembers, userHasPermission } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type QuoteDetailResult = NonNullable<Awaited<ReturnType<typeof getQuoteDetail>>>;

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { quoteId } = await params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) notFound();

  const [profile, detail, shipments, members, canDeleteQuotesByPermission, variants, editLogs, paymentOptions, paymentTerm, olistConnection] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    listQuoteShipments(session.userId, session.tenantId, quoteId),
    listTenantMembers(session.userId, session.tenantId),
    userHasPermission(session.userId, session.tenantId, "quotes:delete"),
    listProductVariants(session.userId, session.tenantId),
    listQuoteEditLogs(session.userId, session.tenantId, quoteId),
    listOlistPaymentOptions(session.userId, session.tenantId),
    getQuotePaymentTerm(session.userId, session.tenantId, quoteId),
    getIntegrationConnection(session.userId, session.tenantId, "olist")
  ]);

  if (!profile) redirect("/login");
  if (!detail) notFound();
  const canDeleteQuotes = profile.role === "owner" || canDeleteQuotesByPermission;
  const quoteEditVariants = variants.map((variant) => ({
    id: variant.variant_id,
    label: `${variant.product_name} - ${variant.variant_name}`,
    sku: variant.sku,
    externalOlistProductId: variant.external_olist_product_id,
    unitCost: Number(variant.unit_cost),
    curve: mapCurve(variant.curve_mode, variant.anchors)
  }));
  const latestSnapshot = detail.snapshots[0]?.snapshot;
  const quoteEditPricingContext = buildQuoteEditPricingContext(latestSnapshot, detail.items);
  const currentMemberOlistUserId = members.find((member) => (
    member.user_id === session.userId &&
    member.member_status === "active" &&
    member.external_olist_user_id
  ))?.external_olist_user_id ?? null;

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

          <QuotePaymentTermPanel
            initialPaymentTerm={paymentTerm}
            defaultCategory={{
              externalId: typeof olistConnection?.settings.default_payment_category_external_id === "string"
                ? olistConnection.settings.default_payment_category_external_id
                : "",
              name: typeof olistConnection?.settings.default_payment_category_name === "string"
                ? olistConnection.settings.default_payment_category_name
                : ""
            }}
            options={paymentOptions.map((option) => ({
              kind: option.kind,
              externalId: option.external_id,
              name: option.name,
              groupName: option.group_name
            }))}
            quoteId={quoteId}
            total={Number(detail.quote.grand_total)}
          />

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 className="font-semibold">Itens</h2>
                <p className="text-xs text-zinc-500">{detail.items.length} item(ns) neste orçamento</p>
              </div>
              <details className="group relative">
                <summary className="focus-ring inline-flex h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-950">
                  <Edit3 size={14} />
                  Editar
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-[min(92vw,720px)] rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl shadow-black/50">
                  <div className="grid gap-3">
                    <QuoteEditPanel editLogs={editLogs} items={detail.items} quote={detail.quote} />
                    <QuoteItemEditPanel
                      items={detail.items}
                      pricingContext={quoteEditPricingContext}
                      quote={detail.quote}
                      variants={quoteEditVariants}
                    />
                  </div>
                </div>
              </details>
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
                    {item.artworks?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.artworks.map((artwork) => (
                          <div
                            className="flex max-w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1.5"
                            key={artwork.id}
                          >
                            {artwork.data_url.startsWith("data:image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                alt=""
                                className="h-10 w-10 shrink-0 rounded border border-zinc-800 object-cover"
                                src={artwork.data_url}
                              />
                            ) : (
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-zinc-800 text-xs text-zinc-500">
                                PDF
                              </span>
                            )}
                            <span className="min-w-0 truncate text-xs text-zinc-400">{artwork.file_name}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                <h2 className="font-semibold">Ações</h2>
                <p className="text-sm text-zinc-500">Gere documentos, compartilhe e envie o orçamento para integrações.</p>
              </div>
              <p className="text-lg font-semibold text-white">{brl.format(Number(detail.quote.grand_total))}</p>
            </div>
            <div className="mt-5 grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Link
                  className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60"
                  href={`/api/quotes/${quoteId}/pdf`}
                >
                  Baixar PDF
                </Link>
                <QuoteWhatsAppButton quoteId={quoteId} />
                <PublicQuoteLinkButton quoteId={quoteId} />
                {canDeleteQuotes ? (
                  <DeleteQuoteButton
                    customerName={detail.quote.customer_name}
                    quoteId={quoteId}
                    redirectTo="/quotes"
                    total={brl.format(Number(detail.quote.grand_total))}
                  />
                ) : null}
              </div>
              <OlistQuoteActions
                customerDocument={detail.quote.customer_document}
                customerEmail={detail.quote.customer_email}
                customerPostalCode={detail.quote.customer_postal_code}
                customerAddressLine={detail.quote.customer_address_line}
                customerAddressNumber={detail.quote.customer_address_number}
                customerAddressComplement={detail.quote.customer_address_complement}
                customerDistrict={detail.quote.customer_district}
                customerCity={detail.quote.customer_city}
                customerState={detail.quote.customer_state}
                customerLocalCode={detail.quote.customer_id}
                customerName={detail.quote.customer_name}
                customerPhone={detail.quote.customer_phone}
                externalCrmId={detail.quote.external_crm_id}
                externalCrmTaskCreatedAt={detail.quote.external_crm_task_created_at}
                externalCrmTaskId={detail.quote.external_crm_task_id}
                defaultResponsibleExternalId={currentMemberOlistUserId}
                externalInvoiceId={detail.quote.external_olist_invoice_id}
                externalInvoiceModel={detail.quote.external_olist_invoice_model}
                externalInvoiceNumber={detail.quote.external_olist_invoice_number}
                externalInvoiceSeries={detail.quote.external_olist_invoice_series}
                fulfillmentNote={detail.quote.external_olist_fulfillment_note}
                fulfillmentSentAt={detail.quote.external_olist_fulfillment_sent_at}
                fulfillmentStatus={detail.quote.external_olist_fulfillment_status}
                externalOlistId={detail.quote.customer_external_olist_id}
                externalOrderId={detail.quote.external_olist_order_id}
                hasCustomer={Boolean(detail.quote.customer_id)}
                defaultPaymentCategory={{
                  externalId: typeof olistConnection?.settings.default_payment_category_external_id === "string"
                    ? olistConnection.settings.default_payment_category_external_id
                    : "",
                  name: typeof olistConnection?.settings.default_payment_category_name === "string"
                    ? olistConnection.settings.default_payment_category_name
                    : ""
                }}
                paymentOptions={paymentOptions.map((option) => ({
                  kind: option.kind,
                  externalId: option.external_id,
                  name: option.name,
                  groupName: option.group_name
                }))}
                quoteId={quoteId}
                shipments={shipments}
                responsibleUsers={members
                  .filter((member) => member.member_status === "active" && member.external_olist_user_id)
                  .map((member) => ({
                    id: member.external_olist_user_id as string,
                    name: member.name,
                    email: member.email
                  }))}
              />
              <MelhorEnvioQuoteLabelActions
                quoteId={quoteId}
                quoteShippingTotal={Number(detail.quote.shipping_total)}
                shipments={shipments}
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

function buildQuoteEditPricingContext(
  snapshot: unknown,
  items: QuoteDetailResult["items"]
) {
  return {
    platform: readEffectivePlatform(snapshot),
    itemCurves: readSnapshotItemCurves(snapshot, items)
  };
}

function readEffectivePlatform(snapshot: unknown) {
  const snapshotRecord = asRecord(snapshot);
  const effectivePlatform = snapshotRecord ? asRecord(snapshotRecord.effectivePlatform) : null;

  return {
    commissionRate: numberFrom(effectivePlatform?.commissionRate, 0),
    fixedFee: numberFrom(effectivePlatform?.fixedFee, 0),
    sellerShippingCost: numberFrom(effectivePlatform?.sellerShippingCost, 0),
    sellerShippingThreshold: numberFrom(effectivePlatform?.sellerShippingThreshold, 0)
  };
}

function readSnapshotItemCurves(
  snapshot: unknown,
  items: QuoteDetailResult["items"]
) {
  const snapshotRecord = asRecord(snapshot);
  if (!snapshotRecord) return {};

  const itemCurves: Record<string, { productVariantId: string | null; curve: PricingCurve }> = {};
  const calculation = asRecord(snapshotRecord.calculation);
  const calculationItems = Array.isArray(calculation?.items) ? calculation.items : [];

  calculationItems.forEach((calculationItem, index) => {
    const item = items[index];
    const curve = asPricingCurve(asRecord(calculationItem)?.curve);
    if (item && curve) {
      itemCurves[item.id] = {
        productVariantId: typeof asRecord(calculationItem)?.productVariantId === "string"
          ? asRecord(calculationItem)?.productVariantId as string
          : item.product_variant_id ?? null,
        curve
      };
    }
  });

  const requestCurve = asPricingCurve(asRecord(snapshotRecord.request)?.pricingCurve);
  if (requestCurve && items[0] && !itemCurves[items[0].id]) {
    itemCurves[items[0].id] = {
      productVariantId: items[0].product_variant_id ?? null,
      curve: requestCurve
    };
  }

  return itemCurves;
}

function mapCurve(mode: PricingCurveMode | null, anchors: Record<string, number> | null): PricingCurve {
  return {
    mode: mode ?? "interpolated",
    points: Object.entries(anchors ?? {})
      .map(([quantity, unitPrice]) => ({
        quantity: Number(quantity),
        unitPrice: Number(unitPrice)
      }))
      .filter((point) => Number.isFinite(point.quantity) && Number.isFinite(point.unitPrice))
      .sort((a, b) => a.quantity - b.quantity)
  };
}

function asPricingCurve(value: unknown): PricingCurve | null {
  const record = asRecord(value);
  if (!record) return null;
  const mode = record.mode === "step" ? "step" : "interpolated";
  const points = Array.isArray(record.points)
    ? record.points
      .map((point) => {
        const pointRecord = asRecord(point);
        return {
          quantity: numberFrom(pointRecord?.quantity, Number.NaN),
          unitPrice: numberFrom(pointRecord?.unitPrice, Number.NaN)
        };
      })
      .filter((point) => Number.isFinite(point.quantity) && Number.isFinite(point.unitPrice))
      .sort((a, b) => a.quantity - b.quantity)
    : [];

  return points.length ? { mode, points } : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberFrom(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
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
