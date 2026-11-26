import type { CommerceOlistJob } from "./olist";
import type { OrderProductionFacts } from "./order-workflow";

export type OrderOlistProgress = { configured: boolean; enabled: boolean; autoInvoice: boolean; autoDispatch: boolean; job: CommerceOlistJob | null };
export type OrderShippingProgress = { shipping: { status: string; label_url: string | null; last_error: string | null } | null; fiscal?: { productionReady: boolean } };
type Input = { order: OrderProductionFacts & { provider: string }; olist: OrderOlistProgress; shipping: OrderShippingProgress | null; pickup: boolean; melhorEnvio: boolean };
export function orderProgress({ order, olist, shipping, pickup, melhorEnvio }: Input) {
  const job = olist.job, erp = olist.configured && olist.enabled;
  const sent = ["shipped", "completed"].includes(order.fulfillment_status);
  const delivered = order.fulfillment_status === "completed" || shipping?.shipping?.status === "delivered";
  const paid = order.payment_status === "paid";
  const approved = order.approved_artworks >= order.required_artworks;
  const productionDone = sent || Boolean(job?.production_completed_at || shipping?.fiscal?.productionReady);
  const authorized = [6, 7].includes(job?.invoice_status ?? 0);
  const fiscalDone = !erp || !olist.autoInvoice || authorized;
  const dispatchDone = !erp || !olist.autoInvoice || !olist.autoDispatch || pickup || Boolean(job?.expedition_id);
  type Owner = "production" | "olist" | "shipping" | "artworks" | null;
  let owner: Owner = null, olistAction: "production_ready" | "retry" | "reconnect" | null = null;
  let stage = "payment", title = "Aguardando pagamento", description = "O pedido será liberado após a confirmação do pagamento do cliente.";
  if (order.cancelled_at || order.payment_status === "refunded" || order.payment_environment === "test") {
    title = order.cancelled_at ? "Pedido encerrado" : order.payment_environment === "test" ? "Pedido de teste" : "Pagamento estornado";
    description = "Nenhuma nova operação de produção, emissão fiscal ou compra de etiqueta será iniciada por este painel.";
  } else if (!paid) {
    owner = order.payment_status === "pending" && order.provider === "manual" ? "production" : null;
  } else if (delivered && order.fulfillment_status === "completed") {
    stage = "completed"; title = "Pedido concluído"; description = "Os documentos e o histórico continuam disponíveis para consulta.";
  } else if (sent || delivered) {
    stage = "completed"; owner = "production"; title = delivered ? "Entrega confirmada" : pickup ? "Retirada confirmada" : "Pedido enviado";
    description = "Confira o recebimento antes de concluir o pedido.";
  } else if (!approved || order.prepared_artworks < order.required_artworks) {
    stage = "artworks"; owner = "artworks"; title = "Vamos conferir as artes";
    description = `${order.approved_artworks} de ${order.required_artworks} artes aprovadas. Prepare as pendentes e aguarde a aprovação do cliente.`;
  } else if (erp && job && ["blocked", "review"].includes(job.status)) {
    stage = !job.sales_order_id ? "production" : !authorized ? "fiscal" : "shipping";
    owner = "olist"; olistAction = job.error_code === "olist_oauth_invalid" ? "reconnect" : "retry";
    title = olistAction === "reconnect" ? "Reconecte o Olist para continuar" : job.error_code === "olist_customer_ambiguous" ? "Escolha o cadastro do cliente no Olist" : "A integração precisa de conferência";
    description = job.error_code === "olist_customer_ambiguous" ? "O CPF/CNPJ retornou mais de um cadastro. Confira os dados e selecione o contato correto; nenhum novo cliente será criado." : "O progresso foi preservado. Confira a pendência antes de continuar; registros já concluídos não serão recriados.";
  } else if (order.fulfillment_status === "received") {
    stage = "production"; owner = "production"; title = "Tudo pronto para produzir";
    description = "Pagamento recebido e artes aprovadas. As folhas de impressão estão disponíveis quando o produto exige arte.";
  } else if (erp && !job?.sales_order_id) {
    stage = "production"; title = "Preparando o pedido no Olist";
    description = "Cliente e pedido de venda serão vinculados automaticamente. Você pode consultar as artes enquanto isso.";
    if (!job || !["pending", "processing"].includes(job.status)) { owner = "olist"; olistAction = "retry"; }
  } else if (erp && !productionDone) {
    stage = "production"; owner = "olist"; olistAction = "production_ready"; title = "Como está a produção?";
    description = olist.autoInvoice ? "Quando os produtos e a embalagem estiverem conferidos, conclua a produção para liberar a emissão da NF-e." : "Conclua a produção após conferir os produtos e a embalagem. O faturamento automático está desativado.";
  } else if (!fiscalDone || !dispatchDone) {
    stage = fiscalDone ? "shipping" : "fiscal"; title = !fiscalDone ? job?.invoice_id ? "Aguardando autorização da NF-e" : "Preparando a nota fiscal" : "Preparando a expedição no Olist";
    description = "Esta etapa é automática. Você não precisa emitir novamente nem refazer o pagamento.";
    if (!job || !["pending", "processing"].includes(job.status)) { owner = "olist"; olistAction = "retry"; }
  } else if (melhorEnvio && !pickup) {
    stage = "shipping";
    const status = shipping?.shipping?.status;
    if (!shipping) { title = "Consultando o envio"; description = "Aguarde a conferência do serviço contratado e das etapas já realizadas."; }
    else if (["label_ready", "posted", "delivered"].includes(status ?? "") && shipping.shipping?.label_url) {
      owner = "production"; title = "Etiqueta pronta para impressão";
      description = "Imprima a etiqueta e prepare o pacote. Gerar a etiqueta não confirma a postagem; marque como enviado somente após despachar.";
    } else {
      owner = "shipping"; title = status === "cart" ? "Confira e compre a etiqueta" : status === "purchased" ? "Etiqueta comprada" : status === "label_ready" ? "Disponibilizar impressão da etiqueta" : ["review", "exception", "processing"].includes(status ?? "") ? "Confira a situação do envio" : "Prepare o envio do pedido";
      description = status === "cart" ? "O pagamento do cliente já foi recebido. A próxima confirmação compra apenas a etiqueta de envio." : status === "purchased" ? "A compra foi confirmada. Gere a etiqueta sem pagar novamente." : "Confira destinatário, documento fiscal e volumes. O serviço escolhido pelo cliente será preservado.";
    }
  } else {
    stage = "shipping"; owner = "production"; title = pickup ? "Pedido pronto para retirada" : "Pedido pronto para envio";
    description = pickup ? "Combine a retirada com o cliente e confirme somente quando entregar o pedido." : "Confira a entrega contratada e confirme somente após despachar o pedido.";
  }
  const steps = [
    { key: "payment", label: "Pagamento", done: paid },
    { key: "artworks", label: "Artes", done: approved, optional: order.required_artworks === 0 },
    { key: "production", label: "Produção", done: productionDone },
    ...(erp && olist.autoInvoice ? [{ key: "fiscal", label: "Nota fiscal", done: authorized }] : []),
    { key: "shipping", label: pickup ? "Retirada" : "Envio", done: sent || ["posted", "delivered"].includes(shipping?.shipping?.status ?? "") },
    { key: "completed", label: "Concluído", done: order.fulfillment_status === "completed" },
  ];
  return { stage, title, description, owner, olistAction, steps, productionDone, authorized };
}
