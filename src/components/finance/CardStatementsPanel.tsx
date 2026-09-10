"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CreditCard, Link2, Loader2, Unlink, X } from "lucide-react";
import type { listCardStatements } from "@/repositories/card-statements";

type Statement = Awaited<ReturnType<typeof listCardStatements>>[number];
const money = (cents: number, currency = "BRL") => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
const date = (value: string) => value.slice(0, 10).split("-").reverse().join("/");

export function CardStatementsPanel({ competence, onRefresh }: { competence: string; onRefresh: () => Promise<void> }) {
  const requestVersion = useRef(0);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ statement: Statement; transactionId: string; action: "link" | "unlink" } | null>(null);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/finance/cards?competence=${competence}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível carregar as faturas.");
      if (version === requestVersion.current) setStatements(data.statements);
    } catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : "Falha ao carregar."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [competence]);
  const invalidateRequests = useCallback(() => { requestVersion.current++; }, []);
  useEffect(() => { setError(""); setPending(null); void load(); return invalidateRequests; }, [load, invalidateRequests]);
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/finance/cards", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ statementId: pending.statement.id, transactionId: pending.transactionId, action: pending.action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível atualizar o vínculo.");
      setPending(null); setSelection({}); await load(); await onRefresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  const transaction = pending ? [...pending.statement.candidates, ...pending.statement.payments].find(item => item.id === pending.transactionId) : null;
  return <section className="space-y-4">
    <h2 className="flex items-center gap-2 font-semibold text-white"><CreditCard size={18} />Faturas do cartão</h2>
    {error && !pending ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    {loading ? <p role="status" className="text-zinc-400"><Loader2 className="mr-2 inline animate-spin" size={16} />Carregando faturas...</p> : null}
    {!loading && !statements.length ? <p className="py-8 text-center text-sm text-zinc-400">Nenhuma fatura nesta competência. Cadastre uma conta do tipo Cartão de crédito e importe o CSV em Importações.</p> : null}
    {statements.map(statement => <article key={statement.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-white">{statement.account_name}</h3><p className="text-xs text-zinc-400">Vencimento {date(statement.due_date)}</p></div><strong className="text-lg text-white">{money(Number(statement.total_cents), statement.currency)}</strong></div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span className="text-emerald-300">Pagamentos vinculados: {money(statement.paidCents, statement.currency)}</span><span className={statement.remainingCents === 0 ? "text-emerald-300" : "text-amber-200"}>{statement.remainingCents === 0 ? "Quitada" : statement.remainingCents < 0 ? `${Number(statement.total_cents) < 0 && !statement.paidCents ? "Crédito na fatura" : "Pago a mais"}: ${money(-statement.remainingCents, statement.currency)}` : `Falta vincular: ${money(statement.remainingCents, statement.currency)}`}</span></div>
      {statement.payments.map(payment => <div key={payment.id} className="mt-3 flex items-center gap-3 border-t border-zinc-800 pt-3 text-sm"><Check className="shrink-0 text-emerald-300" size={16} /><div className="min-w-0 flex-1 break-words text-zinc-300">{date(payment.transaction_date)} · {payment.account_name} · {money(-Number(payment.amount_cents), statement.currency)}<p className="text-xs text-zinc-500">{payment.original_description}</p></div><button type="button" title="Desvincular pagamento" aria-label="Desvincular pagamento" className="focus-ring rounded p-2 text-zinc-400 hover:bg-zinc-800" onClick={() => { setError(""); setPending({ statement, transactionId: payment.id, action: "unlink" }); }}><Unlink size={16} /></button></div>)}
      <details className="mt-3 border-t border-zinc-800 pt-3" open={statement.payments.length === 0}>
        <summary className="cursor-pointer text-sm text-cyan-300">Vincular pagamento do extrato{statement.candidates.some(item => item.suggested) ? " · sugestão encontrada" : ""}</summary>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="grid min-w-0 flex-1 gap-1 text-xs text-zinc-400">Lançamento bancário<select className="h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-white" value={selection[statement.id] ?? ""} onChange={event => setSelection({ ...selection, [statement.id]: event.target.value })}><option value="">Selecione um pagamento...</option>{statement.candidates.map(item => <option key={item.id} value={item.id}>{item.suggested ? "Sugerido · " : ""}{date(item.transaction_date)} · {money(-Number(item.amount_cents), statement.currency)} · {item.account_name} · {item.original_description}</option>)}</select></label>
          <button type="button" className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40" disabled={!selection[statement.id]} onClick={() => { setError(""); setPending({ statement, transactionId: selection[statement.id], action: "link" }); }}><Link2 size={15} />Conferir vínculo</button></div>
      </details>
    </article>)}
    {pending && transaction ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-3"><div role="dialog" aria-modal="true" aria-labelledby="card-payment-title" className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-2"><h3 id="card-payment-title" className="font-semibold text-white">{pending.action === "link" ? "Confirmar pagamento da fatura" : "Desvincular pagamento"}</h3><button disabled={busy} aria-label="Fechar" onClick={() => setPending(null)} className="p-2"><X size={18} /></button></div>
      <p className="mt-4 text-sm text-zinc-300">{pending.statement.account_name} · vencimento {date(pending.statement.due_date)}</p><p className="mt-2 break-words text-sm text-zinc-400">{transaction.original_description} · {date(transaction.transaction_date)} · {transaction.account_name}</p>
      <dl className="my-4 grid grid-cols-2 gap-2 text-sm"><dt>Fatura</dt><dd className="text-right">{money(Number(pending.statement.total_cents), pending.statement.currency)}</dd><dt>Pagamento</dt><dd className="text-right">{money(-Number(transaction.amount_cents), pending.statement.currency)}</dd><dt>Saldo após o vínculo</dt><dd className="text-right text-amber-200">{money(pending.statement.remainingCents + (pending.action === "link" ? Number(transaction.amount_cents) : -Number(transaction.amount_cents)), pending.statement.currency)}</dd></dl>
      <p className="text-sm text-zinc-400">{pending.action === "link" ? "Confirme que esta saída pagou este cartão. O pagamento permanece no fluxo de caixa, mas não será contado novamente como despesa no resultado. Diferenças de valor não serão ajustadas automaticamente." : "O vínculo será removido e as opções de resultado e caixa anteriores serão restauradas."}</p>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      <button type="button" disabled={busy} onClick={confirm} className="mt-4 min-h-11 w-full rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50">{busy ? "Salvando..." : pending.action === "link" ? "Confirmar vínculo" : "Confirmar desvinculação"}</button>
    </div></div> : null}
  </section>;
}
