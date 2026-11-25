import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { commerceTransaction, type BuyerSession, type CommerceOrder } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { assertPendingOrderEditable, pendingOrderActionSchema, type PendingOrderAction } from "@/domain/commerce/pending-order";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { emptyContact } from "@/domain/commerce/checkout-draft";
import { addressSchema, billingSchema } from "@/domain/commerce/schemas";
import { quoteArtworkBenefits } from "@/domain/commerce/quote-artwork-benefit";
import { deliveryEstimate } from "@/domain/shipping/production-lead-time";
import { revokePendingPayment } from "./payment-revocation";

export async function changePendingOrder(tenantId: string, session: BuyerSession, orderId: string, raw: PendingOrderAction) {
  if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
  const input = pendingOrderActionSchema.parse(raw);
  return commerceTransaction(async client => {
    // Match the lock order used by payment reconciliation: order, then session.
    const order = (await client.query<CommerceOrder & { session_id: string; cart_revision: number; converted_quote_id: string | null }>(
      "select * from commerce_orders where tenant_id=$1 and customer_id=$2 and id=$3 for update", [tenantId, session.customer_id, orderId])).rows[0];
    if (!order) throw new CommerceError("Pedido não encontrado nesta conta.", 404);
    if (order.cancelled_at && order.converted_quote_id && input.action === "quote") return { ok: true, quoteId: order.converted_quote_id };
    assertPendingOrderEditable(order);
    const current = (await client.query<BuyerSession>("select * from commerce_sessions where tenant_id=$1 and id=$2 and customer_id=$3 and expires_at>now() for update", [tenantId, session.id, session.customer_id])).rows[0];
    if (!current) throw new CommerceError("Sessão expirada.", 401);
    if (current.revision !== input.revision) throw new CommerceError("O carrinho mudou em outra aba. Atualize antes de continuar.", 409);
    if (current.cart.length && !isDeepStrictEqual(current.cart, order.snapshot.lines) && !input.confirmReplace)
      throw new CommerceError("Há outros itens no carrinho. Confirme a substituição antes de continuar.", 409, { code: "cart_replace_required" });
    const other = (await client.query("select id from commerce_orders where tenant_id=$1 and session_id=$2 and cart_revision=$3 and id<>$4 and cancelled_at is null and deleted_at is null and payment_status='pending'", [tenantId, session.id, current.revision, order.id])).rows[0];
    if (other) throw new CommerceError("Encerre primeiro o pedido pendente do carrinho atual.", 409);
    await revokePendingPayment(client, order);
    let quoteId: string | null = null;
    let lines = order.snapshot.lines;
    if (input.action !== "clear" && order.session_id !== current.id) {
      const mapped = new Map<string, string>();
      lines = [];
      for (const line of order.snapshot.lines) {
        if (!line.artworkId) { lines.push(line); continue; }
        let artworkId = mapped.get(line.artworkId);
        if (!artworkId) {
          const copy = (await client.query<{ id: string }>(`insert into commerce_artworks(tenant_id,session_id,product_id,storage_path,prepared_path,file_name,crop,initial_crop,editing_allowed,approved_at,content_hash)
            select a.tenant_id,$3,a.product_id,a.storage_path,a.prepared_path,a.file_name,a.crop,a.initial_crop,a.editing_allowed,a.approved_at,a.content_hash
            from commerce_artworks a where a.tenant_id=$1 and a.id=$2 returning id`, [tenantId, line.artworkId, current.id])).rows[0];
          if (!copy) throw new CommerceError("Não foi possível recuperar uma das artes. Fale com a loja.", 409);
          artworkId = copy.id; mapped.set(line.artworkId, artworkId);
        }
        lines.push({ ...line, artworkId });
      }
    }
    if (input.action === "quote") {
      if (!order.snapshot.billing) throw new CommerceError("Complete os dados de faturamento antes de salvar como orçamento.", 409);
      quoteId = randomUUID();
      const discount = order.snapshot.artworkDiscountCents ?? 0;
      const snapshot = { items: order.snapshot.items, lines, shippingOption: order.snapshot.shippingOption ?? null,
        delivery: order.snapshot.delivery, production: order.snapshot.production ?? deliveryEstimate(lines.reduce((sum, line) => sum + line.quantity, 0), order.snapshot.delivery === "pickup" ? 0 : order.snapshot.shippingOption?.transitDays ?? null), storeName: (await client.query("select settings->>'name' as name from commerce_stores where tenant_id=$1", [tenantId])).rows[0]?.name ?? "Loja",
        artworkDiscountCents: discount, artworkBenefits: quoteArtworkBenefits(order.snapshot.lines, order.snapshot.products, { items: order.snapshot.items }) };
      const billing = billingSchema.strip().parse(order.snapshot.billing);
      const contact = { billing, address: addressSchema.strip().parse(order.snapshot.address ?? { ...billing, attention: "" }), deliveryAddressSameAsBilling: order.snapshot.deliveryAddressSameAsBilling ?? true };
      await client.query(`insert into commerce_buyer_quotes(id,tenant_id,customer_id,session_id,request_id,request_hash,snapshot,contact_encrypted,subtotal_cents,shipping_cents,total_cents,environment,valid_until)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '3 days')`,
      [quoteId, tenantId, session.customer_id, current.id, order.id, `order:${order.id}`, JSON.stringify(snapshot), encryptTenantSecret(contact), order.subtotal_cents + discount, order.shipping_cents, order.total_cents, order.payment_environment ?? "production"]);
    }
    await client.query("update commerce_orders set cancelled_at=now(),cancellation_reason=$3,converted_quote_id=$4::uuid,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, order.id, input.action, quoteId]);
    await client.query("update commerce_sessions set cart=$4::jsonb,revision=revision+1,cart_intent=$5 where tenant_id=$1 and id=$2 and customer_id=$3", [tenantId, current.id, session.customer_id, JSON.stringify(input.action === "edit" ? lines : []), input.action === "quote" ? "quote" : "purchase"]);
    if (input.action === "edit" && order.snapshot.billing) {
      const draft = { billing: { ...emptyContact(), ...billingSchema.strip().parse(order.snapshot.billing) }, address: { ...emptyContact(), ...order.snapshot.address }, same: order.snapshot.deliveryAddressSameAsBilling ?? true, delivery: order.snapshot.delivery };
      await client.query(`insert into commerce_checkout_drafts(tenant_id,session_id,customer_id,payload_encrypted) values($1,$2,$3,$4)
        on conflict(tenant_id,session_id,customer_id) do update set payload_encrypted=excluded.payload_encrypted,version=commerce_checkout_drafts.version+1,updated_at=now(),expires_at=now()+interval '14 days'`, [tenantId, current.id, session.customer_id, encryptTenantSecret(draft)]);
    }
    await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'order.buyer_closed',$3)", [tenantId, order.id, JSON.stringify({ action: input.action, quoteId, customerId: session.customer_id })]);
    console.info("Commerce pending order closed by buyer.", { tenantId, orderId: order.id, action: input.action, quoteId, sessionId: current.id });
    return { ok: true, quoteId };
  });
}
