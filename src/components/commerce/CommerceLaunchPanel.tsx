"use client";
import React from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { StoreAdminInput } from "@/domain/commerce/schemas";
import type { CommerceLaunchReadiness } from "@/domain/commerce/publication";

export function CommerceLaunchPanel({ input, readiness, onPayments }: {
  input: StoreAdminInput; readiness?: CommerceLaunchReadiness; onPayments: () => void;
}) {
  const checks = [
    { label: "Produtos publicados", ok: input.products.some(product => product.active), target: "commerce-catalog", detail: "Marque ‘Publicar este produto’ no catálogo da loja." },
    { label: "Condições de compra", ok: Boolean(input.settings.terms.trim()), target: "commerce-terms", detail: "Informe produção, entrega, cancelamento e privacidade." },
    { label: "Entrega ou retirada", ok: Boolean(input.settings.pickupEnabled || input.settings.deliveryEnabled || (input.settings.carrierEnabled && readiness?.carrierReady)), target: "commerce-delivery", detail: input.settings.carrierEnabled ? readiness?.carrierMessage : "Escolha Melhor Envio, tarifa fixa ou retirada." },
    { label: "Pagamento habilitado", ok: readiness?.paymentReady ?? false, target: "payments", detail: "Configure o Mercado Pago ou pagamento combinado com a loja." },
  ];
  return <section className="space-y-3 border-b border-zinc-800 pb-5" aria-label="Preparação para publicar">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Preparação para publicar</h2><span className="text-xs text-zinc-400">{checks.filter(item => item.ok).length} de {checks.length} concluídos</span></div>
    <ul className="grid gap-2 sm:grid-cols-2">{checks.map(item => <li key={item.label}>
      <button type="button" className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-zinc-900" onClick={() => item.target === "payments" ? onPayments() : document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
        {item.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300"/> : <CircleAlert size={17} className="mt-0.5 shrink-0 text-amber-300"/>}
        <span className="min-w-0 text-sm">{item.label}{!item.ok ? <small className="mt-1 block leading-5 text-zinc-400">{item.detail}</small> : null}</span>
      </button>
    </li>)}</ul>
    {readiness && (!readiness.emailReady || !readiness.httpsReady) ? <p className="text-xs leading-5 text-amber-200">
      {!readiness.emailReady ? "Configure SMTP no ambiente antes de vender: o acesso do comprador depende do código por e-mail. " : ""}
      {!readiness.httpsReady ? "O Mercado Pago em produção exige APP_URL com HTTPS. " : ""}
    </p> : null}
  </section>;
}
