"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, Circle, FileText, Lock, ReceiptText, Send, ShoppingCart, UserCheck } from "lucide-react";

const ACTIONS = {
  customerLookup: {
    url: "customer/lookup",
    confirm: "Consultar cliente existente na Olist usando os dados deste orçamento?",
    success: "Consulta enviada.",
    label: "Consultar cliente",
    loading: "Consultando..."
  },
  customer: {
    url: "customer",
    confirm: "Criar ou atualizar este cliente na Olist?",
    success: "Cliente sincronizado.",
    label: "Criar cliente Olist",
    loading: "Criando..."
  },
  crm: {
    url: "crm",
    confirm: "Criar ou atualizar um assunto/oportunidade no CRM Olist para este orçamento?",
    success: "Assunto CRM criado.",
    label: "Criar assunto CRM",
    loading: "Enviando..."
  },
  crmTask: {
    url: "crm/task",
    confirm: "Criar uma tarefa vinculada ao assunto CRM deste orçamento?",
    success: "Tarefa CRM criada.",
    label: "Criar tarefa CRM",
    loading: "Criando..."
  },
  salesOrder: {
    url: "sales-order",
    confirm: "Gerar pedido de venda na Olist com os SKUs e preços deste orçamento?",
    success: "Pedido de venda solicitado.",
    label: "Gerar pedido",
    loading: "Gerando..."
  },
  invoice: {
    url: "invoice",
    confirm: "Emitir nota fiscal com os produtos, SKUs e preços deste orçamento?",
    success: "Emissão de nota solicitada.",
    label: "Emitir nota",
    loading: "Emitindo..."
  }
} as const;

type ActionKey = keyof typeof ACTIONS;

export function OlistQuoteActions({
  quoteId,
  hasCustomer,
  externalOlistId,
  externalCrmId,
  externalOrderId,
  externalInvoiceId
}: {
  quoteId: string;
  hasCustomer: boolean;
  externalOlistId?: string | null;
  externalCrmId?: string | null;
  externalOrderId?: string | null;
  externalInvoiceId?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [customerExternalId, setCustomerExternalId] = useState(externalOlistId ?? null);
  const [crmExternalId, setCrmExternalId] = useState(externalCrmId ?? null);
  const [orderExternalId, setOrderExternalId] = useState(externalOrderId ?? null);
  const [invoiceExternalId, setInvoiceExternalId] = useState(externalInvoiceId ?? null);

  async function run(action: ActionKey) {
    const config = ACTIONS[action];
    let body: BodyInit | undefined;
    const headers: Record<string, string> = {};
    if (action === "crmTask") {
      const description = window.prompt("Descrição da tarefa no CRM Olist");
      if (!description?.trim()) return;
      headers["content-type"] = "application/json";
      body = JSON.stringify({ description: description.trim() });
    }
    if (!window.confirm(config.confirm)) return;

    setMessage("");
    setLoading(action);
    const response = await fetch(`/api/quotes/${quoteId}/olist/${config.url}`, { method: "POST", headers, body });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.debugId ? `${data?.error ?? "Falha na integração."} Debug: ${data.debugId}` : data?.error ?? "Falha na integração.");
      return;
    }

    if (data.externalId) {
      if (action === "customerLookup" || action === "customer") setCustomerExternalId(data.externalId);
      if (action === "crm") setCrmExternalId(data.externalId);
      if (action === "salesOrder") setOrderExternalId(data.externalId);
      if (action === "invoice" && !invoiceExternalId) setInvoiceExternalId(data.externalId);
    }
    setMessage(data.externalId ? `${config.success} ID: ${data.externalId}` : config.success);
    router.refresh();
  }

  const customerReady = Boolean(customerExternalId);
  const crmReady = Boolean(crmExternalId);
  const orderReady = Boolean(orderExternalId);
  const invoiceReady = Boolean(invoiceExternalId);

  return (
    <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div>
        <p className="text-sm font-semibold text-white">Fluxo Olist</p>
        <p className="mt-1 flex items-start gap-2 text-xs text-zinc-500">
        <FileText className="mt-0.5 shrink-0" size={14} />
          Cada etapa usa os dados e preços deste orçamento. A próxima ação só libera quando a anterior estiver pronta.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <FlowAction
          description="Procura ou cadastra o contato usado no orçamento."
          disabled={!hasCustomer}
          done={customerReady}
          icon={<UserCheck size={16} />}
          loading={loading}
          onClick={run}
          primaryName={customerReady ? "customer" : "customerLookup"}
          secondaryName={customerReady ? undefined : "customer"}
          title="1. Cliente Olist"
        />
        <FlowAction
          description="Cria o assunto/oportunidade no CRM para registrar o orçamento."
          disabled={!customerReady}
          done={crmReady}
          icon={<Send size={16} />}
          loading={loading}
          onClick={run}
          primaryName="crm"
          title="2. Assunto CRM"
        />
        <FlowAction
          description="Adiciona uma próxima ação na agenda do assunto CRM."
          disabled={!crmReady}
          done={false}
          icon={<CalendarPlus size={16} />}
          loading={loading}
          onClick={run}
          primaryName="crmTask"
          title="3. Tarefa CRM"
        />
        <FlowAction
          description="Gera o pedido de venda na Olist com SKU, quantidade e preço calculado."
          disabled={!customerReady}
          done={orderReady}
          icon={<ShoppingCart size={16} />}
          loading={loading}
          onClick={run}
          primaryName="salesOrder"
          title="4. Pedido de venda"
        />
        <FlowAction
          description={invoiceReady ? "Autoriza a nota fiscal já gerada para este pedido." : "Gera a nota fiscal a partir do pedido de venda."}
          disabled={!orderReady}
          done={invoiceReady}
          icon={<ReceiptText size={16} />}
          label={invoiceReady ? "Autorizar nota Olist" : "Gerar nota Olist"}
          loading={loading}
          onClick={run}
          primaryName="invoice"
          title="5. Nota fiscal"
        />
      </div>
      {message ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{message}</p> : null}
    </div>
  );
}

function FlowAction({
  title,
  description,
  done,
  disabled,
  icon,
  loading,
  primaryName,
  secondaryName,
  label,
  onClick
}: {
  title: string;
  description: string;
  done: boolean;
  disabled: boolean;
  icon: ReactNode;
  loading: string;
  primaryName: ActionKey;
  secondaryName?: ActionKey;
  label?: string;
  onClick: (action: ActionKey) => void;
}) {
  return (
    <div className="grid min-h-[150px] gap-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          {done ? <CheckCircle2 className="text-emerald-300" size={16} /> : disabled ? <Lock className="text-zinc-600" size={16} /> : <Circle className="text-amber-300" size={16} />}
          {title}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionButton disabled={disabled} icon={icon} label={label} loading={loading} name={primaryName} onClick={onClick} />
        {secondaryName ? (
          <ActionButton disabled={disabled} icon={<UserCheck size={16} />} loading={loading} name={secondaryName} onClick={onClick} />
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  name,
  label,
  icon,
  loading,
  disabled = false,
  onClick
}: {
  name: ActionKey;
  label?: string;
  icon: ReactNode;
  loading: string;
  disabled?: boolean;
  onClick: (action: ActionKey) => void;
}) {
  const config = ACTIONS[name];
  return (
    <button
      className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
      disabled={disabled || loading === name}
      onClick={() => onClick(name)}
      type="button"
    >
      {icon}
      {loading === name ? config.loading : label ?? config.label}
    </button>
  );
}
