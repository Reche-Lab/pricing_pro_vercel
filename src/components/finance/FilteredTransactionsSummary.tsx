import React from "react";
import { summarizeFilteredTransactions } from "@/domain/finance/analysis";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function FilteredTransactionsSummary({ transactions }: { transactions: Array<{ amount_cents: string | number; direction: string }> }) {
  const totals = summarizeFilteredTransactions(transactions);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/40 px-3 py-3" aria-label="Totais dos lançamentos filtrados">
    <span className="text-xs text-zinc-400">{transactions.length} lançamento(s){totals.informativeCount ? ` · ${totals.informativeCount} informativo(s) fora da soma` : ""}</span>
    <dl className="flex flex-wrap gap-x-6 gap-y-3 text-xs">
      <div><dt className="text-zinc-500">Entradas filtradas</dt><dd className="mt-1 font-semibold text-emerald-300">{money(totals.inflowsCents)}</dd></div>
      <div><dt className="text-zinc-500">Saídas filtradas</dt><dd className="mt-1 font-semibold text-rose-300">{money(totals.outflowsCents)}</dd></div>
      <div title="Entradas menos saídas dos lançamentos filtrados, sem linhas informativas. Não é o saldo bancário nem o resultado operacional consolidado."><dt className="text-zinc-300">Saldo filtrado</dt><dd className={`mt-1 text-sm font-semibold ${totals.balanceCents < 0 ? "text-rose-300" : "text-cyan-200"}`}>{money(totals.balanceCents)}</dd></div>
    </dl>
  </div>;
}
