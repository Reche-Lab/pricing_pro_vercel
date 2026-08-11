import { notFound } from "next/navigation";
import { PublicQuoteDecision } from "@/components/quotes/PublicQuoteDecision";
import { PublicArtworkStudio } from "@/components/quotes/PublicArtworkStudio";
import { PublicArtworkShortcut } from "@/components/quotes/PublicArtworkShortcut";
import { PublicQuoteExpiryCountdown } from "@/components/quotes/PublicQuoteExpiryCountdown";
import { getPublicArtworkReviewProgress } from "@/domain/quotes/public-artwork-review";
import { quoteDiscountLabel } from "@/domain/quotes/discount";
import { getPublicQuoteByToken } from "@/repositories/quotes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const statusLabels: Record<string, string> = {
  draft: "Em análise",
  sent: "Enviado",
  accepted: "Aceito",
  rejected: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado"
};

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const detail = await getPublicQuoteByToken(token);
  if (!detail) notFound();

  const decisionLocked = detail.quote.status === "accepted" || detail.quote.status === "rejected";
  const artworkProgress = getPublicArtworkReviewProgress(detail.items.map((item) => ({
    artworkName: item.artwork_name,
    artworks: item.artworks?.filter((artwork) => artwork.is_active !== false).map((artwork) => ({ approvalStatus: artwork.approval_status }))
  })));
  const artworkReviewPending = artworkProgress.approved < artworkProgress.required;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {detail.tenant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`Logo ${detail.tenant.name}`}
                  className="h-14 w-14 rounded-lg border border-zinc-800 object-contain"
                  src={detail.tenant.logo_url}
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-lg font-semibold text-cyan-100">
                  {detail.tenant.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-cyan-200">Orçamento</p>
                <h1 className="text-2xl font-semibold text-white">{detail.tenant.name}</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {[detail.tenant.company_phone, detail.tenant.company_site].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 sm:text-right">
              <p className="text-sm text-zinc-500">Status</p>
              <p className="text-lg font-semibold text-white">{statusLabels[detail.quote.status] ?? detail.quote.status}</p>
              {detail.quote.public_token_expires_at ? (
                <PublicQuoteExpiryCountdown expiresAt={detail.quote.public_token_expires_at} />
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
              <p className="text-sm text-zinc-500">Cliente</p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                {detail.quote.customer_name ?? "Cliente não informado"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {[detail.quote.customer_email, detail.quote.customer_phone].filter(Boolean).join(" · ")}
              </p>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
              <div className="border-b border-zinc-800 px-5 py-4">
                <h2 className="font-semibold text-white">Itens do orçamento</h2>
              </div>
              <div className="divide-y divide-zinc-800">
                {detail.items.map((item) => (
                  <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto]" key={item.id}>
                    <div>
                      <p className="font-medium text-white">{item.description}</p>
                      <p className="mt-1 text-zinc-400">
                        {item.quantity} x {brl.format(Number(item.unit_price))}
                      </p>
                      {item.artwork_name ? <p className="mt-1 text-zinc-500">Arte: {item.artwork_name}</p> : null}
                      {item.artworks?.some((artwork) => artwork.is_active !== false) ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.artworks.filter((artwork) => artwork.is_active !== false).map((artwork) => (
                            <div
                              className="flex max-w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1.5"
                              key={artwork.id}
                            >
                              {artwork.data_url?.startsWith("data:image/") || artwork.storage_path ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded border border-zinc-800 object-cover"
                                  src={artwork.data_url || `/api/public/quotes/${token}/artworks/${artwork.id}`}
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
                    </div>
                    <div className="flex items-start justify-between gap-3 sm:grid sm:justify-items-end">
                      <p className="font-semibold text-white">{brl.format(Number(item.total_price))}</p>
                      <PublicArtworkShortcut disabled={decisionLocked} hasArtwork={Boolean(item.artworks?.some((artwork) => artwork.is_active !== false))} itemId={item.id} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {detail.quote.notes ? (
              <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
                <h2 className="font-semibold text-white">Observações</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{detail.quote.notes}</p>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-5">
              <p className="text-sm text-cyan-100/80">Total do orçamento</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
                {brl.format(Number(detail.quote.grand_total))}
              </p>
              <dl className="mt-4 grid gap-2 text-sm">
                <Detail label="Subtotal" value={brl.format(Number(detail.quote.subtotal))} />
                <Detail label="Frete" value={brl.format(Number(detail.quote.shipping_total))} />
                <Detail label={quoteDiscountLabel(detail.quote.discount_type, Number(detail.quote.discount_value ?? detail.quote.discount_total), Number(detail.quote.discount_total))} value={brl.format(Number(detail.quote.discount_total))} />
                {detail.quote.discount_reason ? <Detail label="Motivo" value={detail.quote.discount_reason} /> : null}
                <Detail label="Validade" value={detail.quote.valid_until ? formatDate(detail.quote.valid_until) : "-"} />
              </dl>
            </section>

            <PublicQuoteDecision
              artworkReviewPending={artworkReviewPending}
              disabled={decisionLocked}
              maskedEmail={detail.quote.customer_email}
              requiresOtp={Boolean(detail.quote.public_require_otp)}
              token={token}
            />

            <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-xs leading-5 text-zinc-500">
              Os valores estão sujeitos à confirmação final de disponibilidade, pagamento e produção. Ao aceitar,
              a equipe responsável será avisada para seguir com o atendimento.
            </p>
          </aside>
        </section>
        <PublicArtworkStudio disabled={decisionLocked} items={detail.items} quoteId={detail.quote.id} token={token} />
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormatter.format(date);
}
