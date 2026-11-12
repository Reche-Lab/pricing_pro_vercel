import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { encryptTenantSecret, decryptTenantSecret } from "@/lib/crypto/secrets";
import { calculateCart, CommerceError } from "@/domain/commerce/commerce";
import { buyerQuoteSchema, type BuyerQuoteInput } from "@/domain/commerce/buyer-quote";
import { deliveryEstimate } from "@/domain/shipping/production-lead-time";
import { commerceProducts, commerceTransaction, calculateCommerceCart, hashCommerceToken, type BuyerSession, type CommerceStore } from "./commerce";
import { emptyContact } from "@/domain/commerce/checkout-draft";
import type { StoreShippingOption } from "@/domain/commerce/shipping-options";
import { quoteArtworkBenefits, type QuoteArtworkBenefit } from "@/domain/commerce/quote-artwork-benefit";

type QuoteSnapshot = {
  items: Awaited<ReturnType<typeof calculateCommerceCart>>["items"];
  lines: BuyerSession["cart"];
  shippingOption: StoreShippingOption | null;
  delivery: BuyerQuoteInput["delivery"];
  production: ReturnType<typeof deliveryEstimate>;
  storeName: string;
  artworkDiscountCents: number;
  artworkBenefits?: QuoteArtworkBenefit[];
};
type QuoteContact = Pick<BuyerQuoteInput, "billing" | "address" | "deliveryAddressSameAsBilling">;
export type BuyerQuoteRow = { id: string; tenant_id: string; customer_id: string; snapshot: QuoteSnapshot; contact_encrypted: string; subtotal_cents: number; shipping_cents: number | null; total_cents: number; created_at: string; valid_until: string };
function requireBuyer(session: BuyerSession) {
  if (!session.customer_id) throw new CommerceError("Entre na sua conta para acessar seus orçamentos.", 401);
  return session.customer_id;
}
export async function createBuyerQuote(store: CommerceStore, session: BuyerSession, raw: BuyerQuoteInput) {
  const customerId = requireBuyer(session), input = buyerQuoteSchema.parse(raw);
  return commerceTransaction(async client => {
    const current = (await client.query<BuyerSession>("select * from commerce_sessions where tenant_id=$1 and id=$2 and customer_id=$3 and expires_at>now() for update", [store.tenant_id, session.id, customerId])).rows[0];
    if (!current) throw new CommerceError("Sessão expirada.", 401);
    const requestHash = hashCommerceToken(JSON.stringify({ input, lines: current.cart }));
    const previous = (await client.query<{ id: string; request_hash: string }>("select id,request_hash from commerce_buyer_quotes where tenant_id=$1 and customer_id=$2 and request_id=$3", [store.tenant_id, customerId, input.requestId])).rows[0];
    if (previous) {
      if (previous.request_hash !== requestHash) throw new CommerceError("Esta solicitação já foi concluída com outros dados. Reabra a página para gerar um novo orçamento.", 409);
      return { id: previous.id };
    }
    if (current.revision !== input.revision) throw new CommerceError("O carrinho mudou. Confira os valores antes de gerar o orçamento.", 409);
    const lockedStore = (await client.query<CommerceStore>("select s.*,s.settings || jsonb_build_object('production',t.production_settings) as settings from commerce_stores s join tenants t on t.id=s.tenant_id where s.tenant_id=$1 for share of s,t", [store.tenant_id])).rows[0];
    if (!lockedStore?.enabled || lockedStore.status !== "published") throw new CommerceError("A loja não está recebendo novos orçamentos.", 409);
    const products = await commerceProducts(store.tenant_id, client);
    const calculated = await calculateCommerceCart(store.tenant_id, session.id, current.cart, products, client);
    if (!current.cart.length || calculated.totalCents <= 0) throw new CommerceError("Inclua produtos para gerar seu orçamento.");
    const address = input.deliveryAddressSameAsBilling ? { ...input.billing, attention: "" } : input.address!;
    let shipping: number | null = null;
    let option: QuoteSnapshot["shippingOption"] = null;
    if (input.delivery === "pickup") {
      if (!lockedStore.settings.pickupEnabled) throw new CommerceError("Retirada indisponível.");
      shipping = 0;
    } else if (input.delivery === "delivery") {
      if (input.shippingQuoteId) {
        if (!lockedStore.settings.carrierEnabled) throw new CommerceError("Frete automático indisponível.", 409);
        option = (await client.query<{ option: NonNullable<QuoteSnapshot["shippingOption"]> }>(`select option from commerce_shipping_quotes where id=$1 and tenant_id=$2 and session_id=$3 and cart_revision=$4
          and store_revision=$5 and cart_hash=$6 and postal_code=$7 and expires_at>now()`,
          [input.shippingQuoteId, store.tenant_id, session.id, current.revision, lockedStore.revision, hashCommerceToken(JSON.stringify(calculated)), address.postalCode])).rows[0]?.option ?? null;
        if (!option) throw new CommerceError("Frete expirado. Calcule novamente.", 409);
        shipping = option.priceCents;
      } else if (lockedStore.settings.deliveryEnabled) {
        shipping = lockedStore.settings.deliveryCents;
        option = { id: "delivery", name: lockedStore.settings.deliveryDescription, priceCents: shipping, transitDays: lockedStore.settings.deliveryTransitDays };
      } else throw new CommerceError("Calcule o frete ou gere o orçamento sem frete.");
    }
    if (shipping !== null && (!Number.isSafeInteger(shipping) || shipping < 0)) throw new CommerceError("Frete inválido.");
    const total = calculated.totalCents + (shipping ?? 0);
    if (total !== input.expectedTotalCents) throw new CommerceError("Os valores mudaram. Revise o resumo.", 409);
    const snapshot: QuoteSnapshot = { items: calculated.items, lines: current.cart, shippingOption: option, delivery: input.delivery,
      production: deliveryEstimate(current.cart.reduce((sum, line) => sum + line.quantity, 0), input.delivery === "pickup" ? 0 : option?.transitDays ?? null, lockedStore.settings.production), storeName: lockedStore.settings.name, artworkDiscountCents: calculated.artworkDiscountCents,
      artworkBenefits: quoteArtworkBenefits(current.cart, products, calculated) };
    const contact: QuoteContact = { billing: input.billing, address: { ...address, document: address.document || input.billing.document }, deliveryAddressSameAsBilling: input.deliveryAddressSameAsBilling };
    const result = await client.query<{ id: string }>(`insert into commerce_buyer_quotes(tenant_id,customer_id,session_id,request_id,request_hash,snapshot,contact_encrypted,subtotal_cents,shipping_cents,total_cents)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(tenant_id,customer_id,request_id) do nothing returning id`, [store.tenant_id, customerId, session.id, input.requestId, requestHash, JSON.stringify(snapshot), encryptTenantSecret(contact), calculated.baseSubtotalCents, shipping, total]);
    if (!result.rows[0]) {
      const duplicate = (await client.query<{ id: string; request_hash: string }>("select id,request_hash from commerce_buyer_quotes where tenant_id=$1 and customer_id=$2 and request_id=$3", [store.tenant_id, customerId, input.requestId])).rows[0];
      if (!duplicate || duplicate.request_hash !== requestHash) throw new CommerceError("Solicitação duplicada com outros dados. Reabra a página antes de continuar.", 409);
      return { id: duplicate.id };
    }
    console.info("Commerce buyer quote created.", { tenantId: store.tenant_id, quoteId: result.rows[0].id, itemCount: current.cart.length, includesShipping: shipping !== null });
    return result.rows[0];
  });
}
export async function listBuyerQuotes(tenantId: string, session: BuyerSession) {
  return (await getPool().query<Pick<BuyerQuoteRow, "id" | "total_cents" | "shipping_cents" | "created_at" | "valid_until">>(
    "select id,total_cents,shipping_cents,created_at::text,valid_until::text from commerce_buyer_quotes where tenant_id=$1 and customer_id=$2 order by created_at desc limit 100", [tenantId, requireBuyer(session)])).rows;
}
export async function getBuyerQuote(tenantId: string, session: BuyerSession, id: string) {
  const row = (await getPool().query<BuyerQuoteRow>("select *,created_at::text,valid_until::text from commerce_buyer_quotes where tenant_id=$1 and customer_id=$2 and id=$3", [tenantId, requireBuyer(session), id])).rows[0];
  if (!row) throw new CommerceError("Orçamento não encontrado nesta conta.", 404);
  const { contact_encrypted, ...safe } = row;
  return { ...safe, contact: decryptTenantSecret<QuoteContact>(contact_encrypted) };
}
export async function restoreBuyerQuote(store: CommerceStore, session: BuyerSession, id: string, revision: number) {
  const quote = await getBuyerQuote(store.tenant_id, session, id);
  // Artworks belong to their original session. A different session cannot inherit their IDs.
  await commerceTransaction(async client => {
    const products = await commerceProducts(store.tenant_id, client);
    const reusable = (await client.query<{ id: string }>(`select a.id from commerce_artworks a where a.tenant_id=$1 and a.session_id=$2 and not exists(
      select 1 from commerce_orders o where o.tenant_id=a.tenant_id and exists(select 1 from jsonb_array_elements(o.snapshot->'lines') l where l->>'artworkId'=a.id::text))`, [store.tenant_id, session.id])).rows;
    const lines = quote.snapshot.lines.map(line => {
      const artworkId = reusable.some(art => art.id === line.artworkId) ? line.artworkId : null;
      return { ...line, id: randomUUID(), artworkId, preparation: artworkId ? line.preparation : products.find(product => product.id === line.productId)?.artworkOptions?.allowTeamPreparation ? "team" as const : "customer" as const };
    });
    calculateCart(lines, products);
    const changed = await client.query(`update commerce_sessions set cart=$4,revision=revision+1 where tenant_id=$1 and id=$2 and customer_id=$5 and revision=$3 and expires_at>now() returning id`,
      [store.tenant_id, session.id, revision, JSON.stringify(lines), requireBuyer(session)]);
    if (!changed.rowCount) throw new CommerceError("O carrinho mudou. Confira antes de substituí-lo.", 409);
    const draft = { billing: { ...emptyContact(), ...quote.contact.billing }, address: { ...emptyContact(), ...quote.contact.address }, same: quote.contact.deliveryAddressSameAsBilling, delivery: quote.snapshot.delivery === "pickup" ? "pickup" : "delivery" };
    await client.query(`insert into commerce_checkout_drafts(tenant_id,session_id,customer_id,payload_encrypted) values($1,$2,$3,$4)
      on conflict(tenant_id,session_id,customer_id) do update set payload_encrypted=excluded.payload_encrypted,version=commerce_checkout_drafts.version+1,updated_at=now(),expires_at=now()+interval '14 days'`,
      [store.tenant_id, session.id, session.customer_id, encryptTenantSecret(draft)]);
  });
  return { ok: true, message: "Produtos e dados recuperados. Confira os preços atuais, recalcule o frete e envie as artes antes de comprar." };
}
