"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import type { BillingOverview } from "@/repositories/billing";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function BillingPanel({
  billing,
  returnStatus
}: {
  billing: BillingOverview;
  returnStatus?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(returnMessage(returnStatus));

  async function startCheckout() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.checkoutUrl) {
      setMessage(data?.error ?? "Não foi possível iniciar o pagamento.");
      return;
    }

    window.location.href = data.checkoutUrl;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Assinatura</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{billing.plan_name}</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Cobrança mensal por tenant, com acesso para os usuários do seu espaço.
            </p>
          </div>
          <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1 text-xs font-semibold text-zinc-300">
            {statusLabel(billing.billing_status)}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            label={billing.discounted_amount_cents < billing.amount_cents ? "Valor com voucher" : "Valor mensal"}
            value={brl.format(billing.discounted_amount_cents / 100)}
          />
          <Metric label="Status" value={statusLabel(billing.subscription_status)} />
          <Metric label="Próxima validade" value={formatDate(billing.current_period_end ?? billing.trial_ends_at)} />
        </div>
        {Number(billing.discount_percent) > 0 && billing.discount_expires_at ? (
          <p className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            Voucher ativo de {Number(billing.discount_percent).toFixed(0)}% até {formatDate(billing.discount_expires_at)}.
          </p>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
            disabled={loading}
            onClick={startCheckout}
            type="button"
          >
            <CreditCard size={17} />
            {loading ? "Abrindo checkout..." : "Pagar com Mercado Pago"}
          </button>
          {billing.latest_invoice_checkout_url ? (
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
              href={billing.latest_invoice_checkout_url}
            >
              <ExternalLink size={17} />
              Reabrir último checkout
            </a>
          ) : null}
        </div>
      </section>

      <aside className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="text-emerald-300" size={18} />
          <h3 className="font-semibold text-white">O que está incluso</h3>
        </div>
        <ul className="grid gap-3 text-sm text-zinc-400">
          <li>Precificador com curvas e faixas por canal.</li>
          <li>Orçamentos em PDF e texto para WhatsApp.</li>
          <li>Produtos, clientes, usuários e permissões por tenant.</li>
          <li>Integrações operacionais como frete e CRM.</li>
        </ul>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-2 font-semibold text-white">{value}</p>
    </div>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Ativo",
    blocked: "Bloqueado",
    cancelled: "Cancelado",
    past_due: "Em atraso",
    trial: "Teste",
    open: "Aberta",
    pending: "Pendente",
    paid: "Paga",
    failed: "Falhou"
  };
  return map[status] ?? status;
}

function formatDate(value: string | null) {
  if (!value) return "Não definida";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function returnMessage(status?: string) {
  if (status === "success") return "Pagamento recebido ou em processamento. O status será atualizado pelo Mercado Pago.";
  if (status === "pending") return "Pagamento pendente. Assim que for aprovado, sua assinatura será atualizada.";
  if (status === "failure") return "O pagamento não foi concluído. Você pode tentar novamente.";
  return "";
}
