import type { buyerOrders } from "@/repositories/commerce";
export type BuyerOrder = Awaited<ReturnType<typeof buyerOrders>>[number];
export type OrderCatalogImage = { id: string; imageUrl: string };
export function buyerPaymentLabel(status: string) {
  return ({ paid: "Pagamento confirmado", pending: "Aguardando pagamento", refunded: "Pagamento estornado" } as Record<string, string>)[status] ?? "Pagamento em atualização";
}
export function buyerFulfillmentLabel(status: string) {
  return ({ received: "Pedido recebido", production: "Em produção", shipped: "Enviado", completed: "Concluído" } as Record<string, string>)[status] ?? "Andamento em atualização";
}
const dates = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
export function buyerOrderDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? dates.format(date) : "Data não disponível"; }
export function buyerOrderUnits(order: BuyerOrder) { return order.items.reduce((sum, item) => sum + item.quantity, 0); }
