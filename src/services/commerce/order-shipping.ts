import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { commerceTransaction, type CommerceOrder } from "@/repositories/commerce";
import { getOrderShipment, isoUnknown, persistShippingParcel } from "@/repositories/commerce-shipping";
import { getCommerceOlistJob } from "@/repositories/commerce-olist";
import { estimatePackagingWithClient } from "@/repositories/packaging";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";
import { CommerceError } from "@/domain/commerce/commerce";
import { assertShippingCost, carrierSnapshotSchema, normalizedShipmentStatus, safeShippingUrl, shippingEligibility, type OrderShippingAction, type OrderShipment, type ShippingReview } from "@/domain/commerce/order-shipping";
import { buildCommerceShipmentPayload, centsPart, digits } from "@/domain/commerce/shipping-payload";
import { authorizedCommerceOrder, assertCommerceProofsReady } from "./order-artworks";
import { commerceShippingConnection, commerceShippingRequest } from "./shipping-client";
import { commerceOlistRequest } from "./olist-client";
import { MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";

export async function commerceOrderShippingState(tenantId: string, orderId: string) {
  const order = await authorizedCommerceOrder(tenantId, orderId, null);
  const shipping = await getOrderShipment(tenantId, orderId);
  const olistJob = await getCommerceOlistJob(tenantId, orderId);
  const notifications = (await getPool().query("select count(*) filter(where status in ('pending','sending'))::integer as pending,count(*) filter(where status='failed')::integer as failed from commerce_order_notifications where tenant_id=$1 and order_id=$2", [tenantId, orderId])).rows[0];
  return {
    contracted: order.snapshot.shippingOption ? { name: order.snapshot.shippingOption.name, priceCents: order.shipping_cents } : null,
    readiness: shippingEligibility(order), notifications,
    fiscal: { invoiceKey: shipping?.snapshot.invoiceKey ?? null, senderStateRegister: shipping?.snapshot.senderStateRegister ?? null,
      productionReady: Boolean(shipping?.production_ready_at || olistJob?.production_completed_at),
      productionSource: olistJob?.production_completed_at ? "olist" as const : shipping?.production_ready_at ? "shipping" as const : null },
    shipping: shipping ? { id: shipping.id, status: shipping.operation ? "processing" : shipping.purchase_attempted_at && shipping.status === "cart" ? "review" : shipping.status, service_name: shipping.service_name,
      quoted_cents: shipping.snapshot.review?.currentCents ?? shipping.quoted_cents, purchase_cents: shipping.purchase_cents, tracking_code: shipping.tracking_code,
      tracking_url: safeShippingUrl(shipping.tracking_url), label_url: safeShippingUrl(shipping.label_url), last_error: shipping.last_error,
      olist_tracking_error: "olist_tracking_error" in shipping && shipping.olist_tracking_error ? "O rastreio foi salvo. A atualização no Olist está pendente; confira a conexão e as permissões." : null,
      parcels: shipping.parcels.map(p => ({ id: p.id, status: p.status, trackingCode: p.tracking_code, trackingUrl: safeShippingUrl(p.tracking_url), labelUrl: safeShippingUrl(p.label_url) })) } : null,
  };
}

export async function performCommerceOrderShipping(tenantId: string, orderId: string, actorId: string, input: OrderShippingAction) {
  const debugId = randomUUID();
  console.info("Commerce shipping operation started.", { debugId, tenantId, orderId, action: input.action });
  const order = await authorizedCommerceOrder(tenantId, orderId, null);
  const eligible = shippingEligibility(order);
  if (!eligible.eligible) throw new CommerceError(eligible.reason!, 409);
  if (["review", "cart"].includes(input.action) && order.fulfillment_status !== "production") throw new CommerceError("O pedido já foi enviado ou concluído. Não é possível criar uma nova etiqueta por este fluxo.", 409);
  const connection = await commerceShippingConnection(tenantId);
  await getPool().query(`insert into commerce_order_shipments(tenant_id,order_id,connection_id,service_code,service_name,quoted_cents,created_by)
    values($1,$2,$3,$4,$5,$6,$7) on conflict(tenant_id,order_id) do nothing`,
  [tenantId, orderId, connection.id, order.snapshot.shippingOption!.id.split(":")[1], order.snapshot.shippingOption!.name, order.shipping_cents, actorId]);
  const token = randomUUID();
  const shipment = await claimShipping(tenantId, orderId, token, input.action);
  let purchaseAccepted = false;
  try {
    if (shipment.connection_id !== connection.id) throw new CommerceError("A conexão do envio mudou. Confira as etiquetas existentes antes de continuar.", 409);
    let review: ShippingReview | undefined;
    if (input.action === "review" || input.action === "cart") {
      if (shipment.parcels.length) throw new CommerceError("A criação da etiqueta já foi iniciada. Use Atualizar envio para continuar sem duplicá-la.", 409);
      review = await reviewShipping(order, shipment, input);
      await getPool().query("update commerce_order_shipments set snapshot=$3,production_ready_at=coalesce(production_ready_at,now()),last_error=null,updated_at=now() where tenant_id=$1 and id=$2 and operation_token=$4::uuid", [tenantId, shipment.id, JSON.stringify(shipment.snapshot), token]);
      if (input.action === "cart") {
        assertShippingCost(review.currentCents, shipment.quoted_cents, input);
        await createCartParcels(shipment, order, token);
      }
    } else if (input.action === "checkout") {
      if (!shipment.parcels.length || shipment.parcels.some(p => !p.provider_id)) throw new CommerceError("Inclua todos os volumes no carrinho antes da compra.", 409);
      await reconcileShipping(shipment);
      const current = (await getOrderShipment(tenantId, orderId))!;
      assertCompleteParcels(current);
      if (current.parcels.every(p => ["purchased", "label_ready", "posted", "delivered"].includes(p.status))) return { alreadyCompleted: true };
      if (current.purchase_attempted_at) throw new CommerceError("Já houve uma tentativa de compra sem confirmação definitiva. Confira no Melhor Envio; a cobrança não será repetida automaticamente.", 409);
      if (current.status !== "cart" || current.parcels.some(p => p.status !== "cart")) throw new CommerceError("Confira o estado das etiquetas no Melhor Envio antes de comprar. Nenhuma compra foi repetida.", 409);
      if (current.parcels.some(p => !Number.isSafeInteger(p.price_cents) || p.price_cents === null)) throw new CommerceError("O custo de todos os volumes precisa ser confirmado antes da compra.", 409);
      assertShippingCost(current.purchase_cents ?? -1, shipment.quoted_cents, input);
      // Persist the irreversible intent before the external charge. A timeout requires reconciliation.
      await getPool().query("update commerce_order_shipments set status='review',purchase_attempted_at=now(),last_error='Compra em conferência. Atualize o envio antes de tentar novamente.' where tenant_id=$1 and id=$2", [tenantId, shipment.id]);
      const result = await commerceShippingRequest<Record<string, unknown>>(tenantId, "/me/shipment/checkout", "POST", { orders: current.parcels.map(p => p.provider_id) });
      purchaseAccepted = true;
      console.info("Commerce shipping purchase accepted.", { debugId, tenantId, orderId, shipmentId: shipment.id, parcelCount: current.parcels.length, responseKeys: Object.keys(result ?? {}) });
      await reconcileShipping(current);
      const confirmed = (await getOrderShipment(tenantId, orderId))!;
      if (!confirmed.parcels.every(p => ["purchased", "label_ready", "posted", "delivered"].includes(p.status))) throw new CommerceError("A compra foi recebida pelo Melhor Envio e aguarda confirmação. Use Atualizar envio; não compre novamente.", 409);
    } else if (input.action === "generate") {
      await reconcileShipping(shipment);
      const current = (await getOrderShipment(tenantId, orderId))!;
      if (!current.parcels.length || current.parcels.some(p => !["purchased", "label_ready", "posted", "delivered"].includes(p.status))) throw new CommerceError("Aguarde a confirmação da compra de todas as etiquetas.", 409);
      const ids = current.parcels.filter(p => p.status === "purchased").map(p => p.provider_id);
      if (ids.length) await commerceShippingRequest(tenantId, "/me/shipment/generate", "POST", { orders: ids });
      await reconcileShipping(current);
    } else if (input.action === "print") {
      assertCompleteParcels(shipment);
      if (!shipment.parcels.length || shipment.parcels.some(p => !["label_ready", "posted", "delivered"].includes(p.status))) throw new CommerceError("Gere todas as etiquetas antes de imprimir.", 409);
      const result = await commerceShippingRequest<Record<string, unknown>>(tenantId, "/me/shipment/print", "POST", { mode: "private", orders: shipment.parcels.map(p => p.provider_id) });
      const url = safeShippingUrl(result?.url);
      if (!url) throw new CommerceError("O Melhor Envio ainda não disponibilizou o link da etiqueta. Atualize e tente imprimir novamente.", 409);
      await getPool().query("update commerce_order_shipments set label_url=$3,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, shipment.id, url]);
      await getPool().query("update commerce_order_shipment_parcels set label_url=$3 where tenant_id=$1 and shipment_id=$2", [tenantId, shipment.id, url]);
    } else if (input.action === "refresh") {
      if (shipment.parcels.some(p => !p.provider_id)) throw new CommerceError("O retorno da criação de um volume não foi confirmado. Confira o carrinho no Melhor Envio e contate a administração; não crie outra etiqueta.", 409);
      await reconcileShipping(shipment);
    }
    await getPool().query("update commerce_order_shipments set last_error=null,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, shipment.id]);
    await getPool().query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,'commerce_order',$4,$5)", [tenantId, actorId, `commerce.shipping.${input.action}`, orderId, JSON.stringify({ debugId, shipmentId: shipment.id })]);
    console.info("Commerce shipping operation completed.", { debugId, tenantId, orderId, shipmentId: shipment.id, action: input.action, persisted: true });
    return { review };
  } catch (error) {
    const message = error instanceof CommerceError ? error.message : error instanceof MelhorEnvioRequestError ? `Melhor Envio recusou a operação: ${error.message}` : "Não foi possível confirmar a operação. Atualize o envio antes de tentar novamente.";
    const ambiguous = !(error instanceof CommerceError) && (!(error instanceof MelhorEnvioRequestError) || error.status >= 500);
    if (input.action === "checkout" && !purchaseAccepted && error instanceof MelhorEnvioRequestError && [400, 401, 403, 422].includes(error.status))
      await getPool().query("update commerce_order_shipments set purchase_attempted_at=null where tenant_id=$1 and id=$2", [tenantId, shipment.id]);
    await getPool().query("update commerce_order_shipments set last_error=$3,status=case when $4::boolean then 'review' else status end,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, shipment.id, message.slice(0, 1000), ambiguous]);
    console.error("Commerce shipping operation failed.", { debugId, tenantId, orderId, shipmentId: shipment.id, action: input.action, httpStatus: error instanceof MelhorEnvioRequestError ? error.status : undefined, ambiguous, errorType: error instanceof Error ? error.name : "unknown",
      databaseCode: error && typeof error === "object" && "code" in error ? error.code : undefined,
      stack: error instanceof Error ? error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 6).join("\n") : undefined });
    if (error instanceof MelhorEnvioRequestError) throw error;
    throw error instanceof CommerceError ? error : new CommerceError(message, 502);
  } finally {
    await getPool().query("update commerce_order_shipments set operation=null,operation_token=null,operation_started_at=null where tenant_id=$1 and id=$2 and operation_token=$3::uuid", [tenantId, shipment.id, token]);
  }
}

async function claimShipping(tenantId: string, orderId: string, token: string, action: string) {
  await commerceTransaction(async client => {
    const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, orderId])).rows[0];
    if (!order || !shippingEligibility(order).eligible) throw new CommerceError("O pedido mudou. Confira pagamento e situação antes de continuar.", 409);
    const claimed = await client.query(`update commerce_order_shipments set operation=$3,operation_token=$4::uuid,operation_started_at=now()
      where tenant_id=$1 and order_id=$2 and (operation is null or ($3='refresh' and operation_started_at<now()-interval '5 minutes')) returning id`, [tenantId, orderId, action, token]);
    if (!claimed.rowCount) throw new CommerceError("Já existe uma operação em andamento. Aguarde e atualize o envio.", 409);
  });
  return (await getOrderShipment(tenantId, orderId))!;
}

async function reviewShipping(order: CommerceOrder, shipment: OrderShipment, input: OrderShippingAction): Promise<ShippingReview> {
  const tenantId = order.tenant_id;
  const job = await getCommerceOlistJob(tenantId, order.id);
  if (!input.productionReady && !shipment.production_ready_at && !job?.production_completed_at) throw new CommerceError("Confirme que a produção está concluída antes de preparar o envio.", 409);
  await commerceTransaction(async client => { await assertCommerceProofsReady(client, order); });
  const tenant = (await getPool().query<TenantShippingProfile>("select * from tenants where id=$1 and status='active'", [tenantId])).rows[0];
  if (!tenant) throw new CommerceError("Remetente indisponível.", 409);
  let invoiceKey = input.invoiceKey || shipment.snapshot.invoiceKey || "";
  let stateRegister = input.senderStateRegister || shipment.snapshot.senderStateRegister || "";
  if (job?.invoice_id) {
    const invoice = await commerceOlistRequest(tenantId, `/notas/${job.invoice_id}`);
    const data = invoice.nota && typeof invoice.nota === "object" ? invoice.nota as Record<string, unknown> : invoice;
    if (![6, 7].includes(Number(data.situacao))) throw new CommerceError("A nota vinculada no Olist não está autorizada. Confira a situação fiscal antes de criar a etiqueta.", 409);
    const key = String(data.chaveAcesso ?? data.chave ?? data.chaveNfe ?? "");
    if (/^\d{44}$/.test(key)) {
      if (input.invoiceKey && input.invoiceKey !== key) throw new CommerceError("A chave informada difere da NF-e autorizada vinculada ao pedido Olist.", 409);
      invoiceKey = key;
    }
    if (data.emitente && typeof data.emitente === "object") stateRegister ||= String((data.emitente as Record<string, unknown>).inscricaoEstadual ?? "");
  }
  let carrier = carrierSnapshotSchema.safeParse(shipment.snapshot.carrier ?? order.snapshot.shippingOption?.carrierSnapshot);
  const warnings: string[] = [];
  if (!carrier.success) {
    const items = order.snapshot.items.map(item => ({ productVariantId: order.snapshot.products.find(p => p.id === item.productId)?.variantId ?? "", quantity: item.quantity }));
    const packaging = await estimatePackagingWithClient(getPool(), tenantId, { items });
    if (!packaging) throw new CommerceError("Cadastre uma embalagem compatível para este pedido antigo antes de gerar a etiqueta.", 409);
    const count = packaging.boxesNeeded;
    carrier = carrierSnapshotSchema.safeParse({ originPostalCode: digits(tenant.postal_code), destinationPostalCode: digits(order.snapshot.address?.postalCode),
      insuranceValueCents: order.subtotal_cents,
      volumes: Array.from({ length: count }, (_, index) => ({ width: packaging.box.widthCm, height: packaging.box.heightCm, length: packaging.box.lengthCm, weight: packaging.grossWeightPerBoxKg, insurance: centsPart(order.subtotal_cents, count, index) / 100 })) });
    warnings.push("Pedido anterior ao registro completo da embalagem: confira os volumes reconstruídos com os cadastros atuais. O serviço contratado foi preservado.");
  }
  if (!carrier.success) throw new CommerceError("Confira medidas, peso e CEPs do envio.", 409);
  const payloads = buildCommerceShipmentPayload(order, tenant, carrier.data, invoiceKey, stateRegister);
  let currentCents = 0;
  // Quote each actual label; a carrier's multi-volume total may differ from separate labels.
  for (const payload of payloads) {
    const response = await commerceShippingRequest<unknown>(tenantId, "/me/shipment/calculate", "POST", { from: { postal_code: carrier.data.originPostalCode }, to: { postal_code: carrier.data.destinationPostalCode },
      volumes: payload.volumes.map(v => ({ ...v, insurance: payload.options.insurance_value })), services: shipment.service_code, options: { receipt: false, own_hand: false } });
    const selected = Array.isArray(response) ? response.find(row => row && String(row.id) === shipment.service_code && !row.error) : null;
    const amount = priceCents(selected?.custom_price ?? selected?.price);
    if (amount === null) throw new CommerceError("O serviço contratado não está disponível para estes volumes. Não trocamos a modalidade automaticamente; confira com a equipe.", 409);
    currentCents += amount;
  }
  const from = payloads[0].from, to = payloads[0].to;
  const review: ShippingReview = { serviceName: shipment.service_name, contractedCents: shipment.quoted_cents, currentCents, changed: currentCents !== shipment.quoted_cents,
    sender: { name: from.name, postalCode: from.postal_code },
    recipient: { name: to.name, document: to.document ?? to.company_document ?? "", phone: to.phone, postalCode: to.postal_code, address: to.address, number: to.number, complement: to.complement, district: to.district, city: to.city, state: to.state_abbr },
    volumes: carrier.data.volumes, warnings };
  shipment.snapshot = { carrier: carrier.data, invoiceKey, senderStateRegister: stateRegister, review };
  return review;
}

async function createCartParcels(shipment: OrderShipment, order: CommerceOrder, token: string) {
  const tenant = (await getPool().query<TenantShippingProfile>("select * from tenants where id=$1", [order.tenant_id])).rows[0];
  const payloads = buildCommerceShipmentPayload(order, tenant, shipment.snapshot.carrier!, shipment.snapshot.invoiceKey!, shipment.snapshot.senderStateRegister!);
  await getPool().query("update commerce_order_shipments set status='review' where tenant_id=$1 and id=$2 and operation_token=$3::uuid", [order.tenant_id, shipment.id, token]);
  let actualTotal = 0;
  const placeholders = await commerceTransaction(async client => {
    const rows: Array<{ id: string }> = [];
    for (const [index, payload] of payloads.entries()) rows.push((await client.query<{ id: string }>("insert into commerce_order_shipment_parcels(tenant_id,shipment_id,parcel_index,snapshot) values($1,$2,$3,$4) returning id", [order.tenant_id, shipment.id, index, JSON.stringify(payload)])).rows[0]);
    return rows;
  });
  for (const [index, payload] of payloads.entries()) {
    // A durable placeholder means an interrupted creation is never repeated blindly.
    const parcel = placeholders[index];
    let response: Record<string, unknown>;
    try { response = await commerceShippingRequest<Record<string, unknown>>(order.tenant_id, "/me/cart", "POST", payload); }
    catch (error) {
      if (index === 0 && error instanceof MelhorEnvioRequestError && [400, 401, 403, 422].includes(error.status)) {
        // A definitive first-volume rejection created no labels; OAuth/data corrections may retry safely.
        await commerceTransaction(async client => {
          await client.query("delete from commerce_order_shipment_parcels where tenant_id=$1 and shipment_id=$2 and provider_id is null", [order.tenant_id, shipment.id]);
          await client.query("update commerce_order_shipments set status='quoted' where tenant_id=$1 and id=$2 and operation_token=$3::uuid", [order.tenant_id, shipment.id, token]);
        });
      }
      throw error;
    }
    const id = z.string().uuid().safeParse(response?.id);
    if (!id.success) throw new CommerceError("O Melhor Envio recebeu a solicitação, mas não confirmou o identificador. Confira o carrinho antes de continuar.", 409);
    const amount = priceCents(response.custom_price ?? response.price);
    await getPool().query("update commerce_order_shipment_parcels set provider_id=$3::uuid,status='cart',price_cents=$4,updated_at=now() where tenant_id=$1 and id=$2", [order.tenant_id, parcel.id, id.data, amount]);
    if (amount === null) throw new CommerceError("O custo do volume não foi confirmado. Atualize o envio antes de comprar.", 409);
    actualTotal += amount;
  }
  await getPool().query("update commerce_order_shipments set status='cart',purchase_cents=$3,updated_at=now() where tenant_id=$1 and id=$2", [order.tenant_id, shipment.id, actualTotal]);
}

async function reconcileShipping(shipment: OrderShipment) {
  if (!shipment.parcels.length) throw new CommerceError("Nenhuma etiqueta foi incluída no carrinho ainda.", 409);
  assertCompleteParcels(shipment);
  for (const parcel of shipment.parcels) {
    if (!parcel.provider_id) throw new CommerceError("Um volume está com retorno pendente. Confira a criação no Melhor Envio antes de prosseguir.", 409);
    const response = await commerceShippingRequest<Record<string, unknown>>(shipment.tenant_id, `/me/orders/${parcel.provider_id}`);
    const data = response.order && typeof response.order === "object" ? response.order as Record<string, unknown> : response;
    if (String(data.id) !== parcel.provider_id) throw new CommerceError("O Melhor Envio não confirmou a etiqueta esperada. Nenhuma compra será repetida.", 409);
    const status = normalizedShipmentStatus(data);
    const at = isoUnknown(data.updated_at) ?? isoUnknown(data.delivered_at) ?? isoUnknown(data.posted_at) ?? isoUnknown(data.generated_at) ?? isoUnknown(data.paid_at) ?? new Date().toISOString();
    const key = `read:${parcel.provider_id}:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`;
    await persistShippingParcel(shipment.tenant_id, shipment.id, parcel.id, data, key, at, true);
    const amount = priceCents(data.custom_price ?? data.price);
    if (status === "cart") {
      await getPool().query("update commerce_order_shipment_parcels set price_cents=$3 where tenant_id=$1 and id=$2", [shipment.tenant_id, parcel.id, amount]);
      if (amount === null) throw new CommerceError("O Melhor Envio não confirmou o custo atual de um volume. A compra está bloqueada até a conferência.", 409);
    }
  }
  await getPool().query(`update commerce_order_shipments s set purchase_cents=(select sum(price_cents)::integer from commerce_order_shipment_parcels p where p.tenant_id=s.tenant_id and p.shipment_id=s.id),updated_at=now() where tenant_id=$1 and id=$2`, [shipment.tenant_id, shipment.id]);
}

function assertCompleteParcels(shipment: OrderShipment) {
  const count = shipment.snapshot.carrier?.volumes.length;
  if (!count || shipment.parcels.length !== count || shipment.parcels.some((p, i) => p.parcel_index !== i)) throw new CommerceError("A criação de alguns volumes não foi concluída. Confira todas as etiquetas antes de continuar; nenhuma compra parcial será feita.", 409);
}

function priceCents(value: unknown) {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents) && cents >= 0 && cents <= 100000000 ? cents : null;
}
