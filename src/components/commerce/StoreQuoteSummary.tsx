"use client";
import React, { useId, useState } from "react";
import { ChevronUp } from "lucide-react";
import { storeMoney } from "./store-http";
import q from "./quote.module.css";

export function StoreQuoteSummary({ totalCents, totalLabel = "Total", children, action }: { totalCents: number; totalLabel?: string; children: React.ReactNode; action: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false), id = useId();
  const amount = storeMoney(totalCents);
  return <aside className={q.summary} data-expanded={expanded} aria-label="Resumo do orçamento">
    <h2 className={q.summaryHeading}>Resumo do orçamento</h2>
    <button type="button" className={q.summaryToggle} aria-expanded={expanded} aria-controls={id} title={expanded ? "Recolher resumo" : "Ver composição do orçamento"} onClick={() => setExpanded(value => !value)}><span>{totalLabel}<ChevronUp size={16} aria-hidden="true"/></span><strong style={{ fontSize: Math.max(12, 18 - Math.max(0, amount.length - 9) * 1.25) }}>{amount}</strong><span className="sr-only">Ver resumo do orçamento</span></button>
    <div id={id} className={q.summaryContent}>{children}</div>
    <div className={q.summaryAction}>{action}</div>
  </aside>;
}
