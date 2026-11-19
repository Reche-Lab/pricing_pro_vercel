"use client";
import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import { LibraryDialog } from "./LibraryUI";
import { storeRequest } from "./store-http";
import styles from "./store.module.css";
import q from "./quote.module.css";
import css from "./cart-controls.module.css";
import type { PendingOrderAction } from "@/domain/commerce/pending-order";
import { useStoreAnalytics } from "./StoreAnalytics";
import type { AnalyticsParameters } from "@/domain/commerce/analytics";

export function StoreCartControls({ api, base, revision, orderId, onChanged, disabled = false, showPaymentLink = false, analyticsPayload }: {
  api: string; base: string; revision: number; orderId?: string; onChanged: () => Promise<void>; disabled?: boolean; showPaymentLink?: boolean; analyticsPayload?: AnalyticsParameters;
}) {
  const analytics = useStoreAnalytics();
  const [action, setAction] = useState<PendingOrderAction["action"] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [replaceRequired, setReplaceRequired] = useState(false), [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const lock = useRef(false), router = useRouter();
  const titles = { edit: "Editar os itens da compra", clear: "Limpar o carrinho", quote: "Salvar a compra como orçamento" };
  function open(next: PendingOrderAction["action"]) { setAction(next); setError(""); setReplaceRequired(false); setReplaceConfirmed(false); }
  async function submit() {
    if (!action || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = orderId ? await storeRequest(`${api}/orders/${orderId}/cart`, "POST", { action, revision, confirm: true, confirmReplace: replaceConfirmed })
        : await storeRequest(`${api}/cart`, "PUT", { revision, lines: [], intent: "purchase" });
      if (analyticsPayload && result.quoteId) analytics.once(`quote_created:${result.quoteId}`, "quote_created", { ...analyticsPayload, customer_state: "identified", journey: "quote" });
      if (analyticsPayload && action === "clear") analytics.track("remove_from_cart", { ...analyticsPayload, journey: "purchase" });
      await onChanged();
      router.push(result.quoteId ? `${base}/orcamentos/${result.quoteId}` : `${base}/carrinho`);
      setAction(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Seus itens foram preservados.");
      if (cause && typeof cause === "object" && "details" in cause && (cause.details as { code?: string })?.code === "cart_replace_required") setReplaceRequired(true);
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className={css.root} aria-label={orderId ? "Gerenciar compra pendente" : "Organizar carrinho"}>
    {orderId ? <div className={css.notice}><ShoppingBag size={20}/><div><strong>Seus itens continuam no carrinho</strong><p>O pagamento ainda não foi confirmado. Você pode continuar a compra ou mudar os planos.</p></div></div> : null}
    <div className={css.actions}>
      {orderId && showPaymentLink ? <Link className={styles.primary} href={`${base}/pedidos/${orderId}`}>Continuar pagamento</Link> : null}
      {orderId ? <><button type="button" className={styles.secondary} disabled={disabled || busy} onClick={() => open("edit")}><Pencil size={16}/>Editar itens</button><button type="button" className={styles.secondary} disabled={disabled || busy} onClick={() => open("quote")}><FileText size={16}/>Salvar como orçamento</button></> : null}
      <button type="button" className={styles.secondary} disabled={disabled || busy} onClick={() => open("clear")}><Trash2 size={16}/>Limpar carrinho</button>
    </div>
    {action ? <LibraryDialog title={titles[action]} busy={busy} onClose={() => setAction(null)}><div className={q.confirmation}>
      <p>{action === "edit" ? "Vamos encerrar o pedido pendente e devolver os produtos e as artes ao carrinho para edição. Seus dados de faturamento e entrega serão mantidos; confira os preços e recalcule o frete antes de comprar novamente."
        : action === "quote" ? "Os produtos, valores, artes e dados desta compra serão salvos em Meus orçamentos, com o frete informado. O pedido pendente será encerrado e o carrinho ficará vazio. Você poderá retomar a compra depois, conferindo os preços e o frete atualizados."
          : orderId ? "O pedido pendente será encerrado e os itens serão removidos do carrinho. O histórico será preservado, mas esta compra não seguirá para produção." : "Todos os itens serão removidos do carrinho. Seus orçamentos salvos não serão excluídos."}</p>
      {orderId ? <p className={css.hint}>Se houver um Pix ou link emitido, precisamos confirmar que o pagamento anterior não pode mais ser concluído. Não faremos estornos automáticos.</p> : null}
      {replaceRequired ? <label><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)}/>Confirmo substituir os itens diferentes que estão no carrinho atual.</label> : null}
      {error ? <p role="alert" className={q.error}>{error}</p> : null}
      <div className={css.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => setAction(null)}>Voltar</button><button type="button" className={styles.primary} disabled={busy || (replaceRequired && !replaceConfirmed)} onClick={() => void submit()}>{busy ? <Loader2 size={16} className="animate-spin"/> : action === "quote" ? <FileText size={16}/> : action === "clear" ? <Trash2 size={16}/> : <Pencil size={16}/>}{busy ? "Verificando e salvando…" : action === "quote" ? "Salvar orçamento e encerrar compra" : action === "clear" ? "Confirmar limpeza" : "Liberar itens para edição"}</button></div>
    </div></LibraryDialog> : null}
  </section>;
}
