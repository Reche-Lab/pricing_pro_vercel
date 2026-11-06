export type OrderProductionFacts = {
  payment_status: string;
  fulfillment_status: string;
  required_artworks: number;
  prepared_artworks: number;
  approved_artworks: number;
};
export const orderFilters = ["all", "unread", "payment", "preparation", "approval", "ready", "production", "shipped", "completed"] as const;
export type OrderFilter = typeof orderFilters[number];
export function orderProductionState(order: OrderProductionFacts) {
  const paid = order.payment_status === "paid";
  const approved = order.approved_artworks >= order.required_artworks;
  const editable = order.fulfillment_status === "received" && order.payment_status !== "refunded";
  const printable = paid && approved && order.required_artworks > 0;
  const key = order.payment_status === "refunded" ? "refunded"
    : order.fulfillment_status === "completed" ? "completed"
    : order.fulfillment_status === "shipped" ? "shipped"
    : order.fulfillment_status === "production" ? "production"
    : !paid ? "payment"
    : order.prepared_artworks < order.required_artworks ? "preparation"
    : !approved ? "approval" : "ready";
  const label = { refunded: "Pagamento estornado", completed: "Concluído", shipped: "Enviado", production: "Em produção", payment: "Aguardando pagamento", preparation: "Preparar artes", approval: "Aguardando aprovação do cliente", ready: "Pronto para produção" }[key];
  return { key, label, editable, printable };
}
export function orderEventLabel(event: string) {
  return ({ "order.created": "Compra recebida", "payment.paid": "Pagamento confirmado", "payment.pending": "Pagamento pendente", "payment.refunded": "Pagamento estornado", "payment.checkout_created": "Checkout de pagamento disponível", confirm_manual: "Pagamento manual confirmado", production: "Produção iniciada", shipped: "Pedido enviado", completed: "Pedido concluído", "artwork.source": "Arte ajustada pela equipe", "artwork.prepare": "Enquadramento atualizado", "artwork.publish": "Prova enviada para aprovação", "artwork.approve": "Arte aprovada pelo cliente" } as Record<string, string>)[event] ?? "Pedido atualizado";
}

export type OrderWorkspaceItem = OrderProductionFacts & {
  id: string;
  customer_name: string;
  total_cents: number;
  provider: string;
  created_at: string;
  activity_at: string;
  unread: boolean;
  item_count: number;
};
export type OrderWorkspace = {
  orders: OrderWorkspaceItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; unread: number; payment: number; preparation: number; approval: number; ready: number; production: number };
};
