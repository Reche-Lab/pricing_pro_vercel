import { confirmQuoteShippingOlistSync } from "@/repositories/quote-shipping";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../olist/_shared";

const manualMessage = "A retirada foi salva no orçamento. No pedido Olist, zere o frete cobrado, revise as parcelas e altere o transporte para retirada. Depois clique em Conferir no Olist.";

export async function syncQuotePickup(quoteId: string) {
  try {
    const loaded = await loadQuoteOlistContext(quoteId, "olist");
    if ("error" in loaded && loaded.error) return { pending: true, message: manualMessage, error: loaded.error.body };
    const quote = loaded.detail.quote;
    if (quote.external_olist_invoice_id) {
      return { pending: true, message: "O orçamento mudou ou já tem nota fiscal. Atualize a página antes de continuar." };
    }
    const orderId = quote.external_olist_order_id;
    if (!orderId) return { pending: false, message: "Retirada no local, sem frete." };
    const base = { userId: loaded.session.userId, tenantId: loaded.session.tenantId, quoteId, provider: "olist" as const, settings: loaded.settings, credentials: loaded.credentials };
    const path = `/pedidos/${encodeURIComponent(orderId)}`;
    const fetched = await sendOlistQuoteOperation({ ...base, operation: "sales_orders.pickup.check", method: "GET", path });
    const order = unwrapOrder(fetched.result);
    if (!order || !["0", "3", "8"].includes(String(order.situacao))) {
      return { pending: true, message: "O pedido Olist não está em situação editável. Revise o pedido diretamente no ERP; a retirada permanece salva no orçamento." };
    }
    const rawFreight = order.valorFrete;
    const freight = typeof rawFreight === "number" || typeof rawFreight === "string" && rawFreight.trim() ? Number(rawFreight) : NaN;
    if (quote.delivery_method !== "pickup") {
      if (!Number.isFinite(freight) || Math.abs(freight - Number(quote.shipping_total)) >= 0.005) return { pending: true, message: "O frete do pedido Olist ainda difere do orçamento. Ajuste o valor e as parcelas diretamente no ERP e confira novamente." };
      await confirmQuoteShippingOlistSync(base.userId, base.tenantId, quoteId, orderId, Number(quote.shipping_total), "delivery");
      return { pending: false, message: "Frete do pedido Olist conferido com o orçamento. Revise eventuais pagamentos diretamente no ERP." };
    }
    const marker = `[Pricing Pro retirada ${quoteId}]`;
    const notes = typeof order.observacoesInternas === "string" ? order.observacoesInternas.split("\n").filter(line => !line.startsWith(marker)) : [];
    notes.push(`${marker} Retirada no local. Frete do orçamento: R$ 0,00. Total: R$ ${Number(quote.grand_total).toFixed(2)}. Conferir frete cobrado e parcelas no ERP.`);
    // PUT /pedidos does not document valorFrete. Never claim its total was updated.
    await sendOlistQuoteOperation({ ...base, operation: "sales_orders.pickup.note", method: "PUT", path, payload: { observacoesInternas: notes.join("\n") } });
    if (!Number.isFinite(freight) || Math.abs(freight) >= 0.005) return { pending: true, message: `Observação de retirada enviada ao Olist. ${manualMessage}` };
    const pickupId = Number(loaded.settings.pickup_forma_envio_id);
    if (!Number.isSafeInteger(pickupId) || pickupId <= 0) {
      return { pending: true, message: "O frete cobrado no Olist está zerado. Configure o ID de Retirar pessoalmente em Configurações > Olist para concluir a atualização do despacho." };
    }
    await sendOlistQuoteOperation({ ...base, operation: "sales_orders.pickup.dispatch", method: "PUT", path: `${path}/despacho`, payload: { formaEnvio: { id: pickupId }, fretePagoEmpresa: 0, codigoRastreamento: "", urlRastreamento: "", observacoes: "Retirada no local pelo cliente. Sem envio por transportadora." } });
    await confirmQuoteShippingOlistSync(base.userId, base.tenantId, quoteId, orderId);
    return { pending: false, message: "Frete zerado conferido no Olist e forma de envio atualizada para retirada. Confira as parcelas e eventuais valores já pagos diretamente no ERP." };
  } catch (error) {
    console.error("Quote pickup Olist sync failed.", { quoteId, message: error instanceof Error ? error.message : "Unknown error" });
    const failure = olistOperationErrorResponse(error, "Não foi possível atualizar a retirada no Olist.");
    return { ...failure, pending: true, message: "A retirada está salva no orçamento, mas a atualização do Olist está pendente. Reconecte ou tente novamente em Conferir no Olist." };
  }
}

function unwrapOrder(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if ("situacao" in data) return data;
  for (const key of ["data", "pedido", "result"]) {
    const nested = data[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested) && "situacao" in nested) return nested as Record<string, unknown>;
  }
  return null;
}
