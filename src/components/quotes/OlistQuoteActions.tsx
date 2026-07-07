"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentRow } from "@/repositories/shipments";
import {
  CalendarPlus,
  CheckCircle2,
  Circle,
  FileText,
  Lock,
  ReceiptText,
  Send,
  ShoppingCart,
  Truck,
  UserCheck,
  X
} from "lucide-react";

const ACTIONS = {
  customerLookup: {
    url: "customer/lookup",
    title: "Consultar cliente Olist",
    description: "Procura no Olist/Tiny um contato com os dados deste orçamento.",
    success: "Cliente encontrado.",
    label: "Consultar cliente",
    loading: "Consultando...",
    submitLabel: "Consultar agora"
  },
  customer: {
    url: "customer",
    title: "Criar cliente Olist",
    description: "Cria o cliente deste orçamento no Olist/Tiny e vincula o ID retornado ao cadastro local.",
    success: "Cliente sincronizado.",
    label: "Criar cliente Olist",
    loading: "Criando...",
    submitLabel: "Criar cliente"
  },
  crm: {
    url: "crm",
    title: "Criar assunto CRM",
    description: "Registra uma oportunidade/assunto no CRM Olist para acompanhar este orçamento.",
    success: "Assunto CRM criado.",
    label: "Criar assunto CRM",
    loading: "Enviando...",
    submitLabel: "Criar assunto"
  },
  crmTask: {
    url: "crm/task",
    title: "Criar tarefa CRM",
    description: "Adiciona uma próxima ação na agenda do assunto CRM já criado.",
    success: "Tarefa CRM criada.",
    label: "Criar tarefa CRM",
    loading: "Criando...",
    submitLabel: "Criar tarefa"
  },
  salesOrder: {
    url: "sales-order",
    title: "Gerar pedido de venda",
    description: "Gera um pedido Olist/Tiny com SKUs, quantidades e preços finais deste orçamento.",
    success: "Pedido de venda solicitado.",
    label: "Gerar pedido",
    loading: "Gerando...",
    submitLabel: "Gerar pedido"
  },
  fulfillment: {
    url: "fulfillment",
    title: "Enviar para expedição",
    description: "Marca o pedido de venda Olist como pronto para separação e envio.",
    success: "Pedido enviado para expedição.",
    label: "Enviar para expedição",
    loading: "Enviando...",
    submitLabel: "Confirmar expedição"
  },
  invoice: {
    url: "invoice",
    title: "Nota fiscal Olist",
    description: "Gera ou autoriza a nota fiscal relacionada ao pedido de venda.",
    success: "Emissão de nota solicitada.",
    label: "Emitir nota",
    loading: "Emitindo...",
    submitLabel: "Continuar"
  },
  invoiceCancel: {
    url: "invoice/cancel",
    title: "Cancelar nota fiscal",
    description: "Solicita o cancelamento da nota fiscal vinculada a este orçamento no Olist/Tiny.",
    success: "Cancelamento solicitado.",
    label: "Cancelar nota",
    loading: "Cancelando...",
    submitLabel: "Solicitar cancelamento"
  }
} as const;

type ActionKey = keyof typeof ACTIONS;
type LookupStatus = "found" | "not_found" | "created";

type CustomerLookupState = {
  status: LookupStatus;
  externalId: string | null;
  summary: Record<string, unknown> | null;
  criteria?: Record<string, unknown> | null;
  raw: unknown;
};

type OlistActionResult = {
  tone: "success" | "error" | "info";
  title: string;
  message: string;
  debugId?: string | null;
  externalId?: string | null;
  path?: string | null;
  summary?: Record<string, unknown> | null;
};

type SalesOrderPreviewState = {
  loading: boolean;
  error: string | null;
  data: {
    path?: string;
    method?: string;
    quote?: Record<string, unknown>;
    items?: Array<Record<string, unknown>>;
    payload?: unknown;
    missingSkus?: string[];
  } | null;
};

type InvoicePreviewState = {
  loading: boolean;
  error: string | null;
  data: {
    mode?: "create" | "emit";
    title?: string;
    path?: string;
    method?: string;
    quote?: Record<string, unknown>;
    shipment?: Record<string, unknown> | null;
    items?: Array<Record<string, unknown>>;
    payload?: unknown;
    missingSkus?: string[];
  } | null;
};

export function OlistQuoteActions({
  quoteId,
  hasCustomer,
  customerName,
  customerDocument,
  customerEmail,
  customerPhone,
  customerPostalCode,
  customerAddressLine,
  customerAddressNumber,
  customerAddressComplement,
  customerDistrict,
  customerCity,
  customerState,
  customerLocalCode,
  externalOlistId,
  externalCrmId,
  externalOrderId,
  externalInvoiceId,
  externalInvoiceNumber,
  externalInvoiceSeries,
  externalInvoiceModel,
  fulfillmentStatus,
  fulfillmentSentAt,
  fulfillmentNote,
  shipments,
  responsibleUsers
}: {
  quoteId: string;
  hasCustomer: boolean;
  customerName?: string | null;
  customerDocument?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerPostalCode?: string | null;
  customerAddressLine?: string | null;
  customerAddressNumber?: string | null;
  customerAddressComplement?: string | null;
  customerDistrict?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerLocalCode?: string | null;
  externalOlistId?: string | null;
  externalCrmId?: string | null;
  externalOrderId?: string | null;
  externalInvoiceId?: string | null;
  externalInvoiceNumber?: string | null;
  externalInvoiceSeries?: string | null;
  externalInvoiceModel?: string | null;
  fulfillmentStatus?: string | null;
  fulfillmentSentAt?: string | null;
  fulfillmentNote?: string | null;
  shipments?: ShipmentRow[];
  responsibleUsers?: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [customerExternalId, setCustomerExternalId] = useState(externalOlistId ?? null);
  const [crmExternalId, setCrmExternalId] = useState(externalCrmId ?? null);
  const [orderExternalId, setOrderExternalId] = useState(externalOrderId ?? null);
  const [invoiceExternalId, setInvoiceExternalId] = useState(externalInvoiceId ?? null);
  const [fulfillmentState, setFulfillmentState] = useState({
    status: fulfillmentStatus ?? "not_sent",
    sentAt: fulfillmentSentAt ?? null
  });
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [customerLookup, setCustomerLookup] = useState<CustomerLookupState | null>(null);
  const [actionResult, setActionResult] = useState<OlistActionResult | null>(null);
  const [usingCustomer, setUsingCustomer] = useState(false);

  const customerReady = Boolean(customerExternalId);
  const crmReady = Boolean(crmExternalId);
  const orderReady = Boolean(orderExternalId);
  const fulfillmentReady = fulfillmentState.status === "sent_to_fulfillment";
  const invoiceReady = Boolean(invoiceExternalId);

  const defaultCrmSubject = useMemo(
    () => `Orçamento ${quoteId}`,
    [quoteId]
  );
  const customerLookupDefaults = useMemo(
    () => ({
      name: customerName ?? "",
      firstName: firstName(customerName),
      document: digits(customerDocument),
      phone: digits(customerPhone),
      email: customerEmail ?? "",
      codigo: customerLocalCode ?? ""
    }),
    [customerName, customerDocument, customerEmail, customerPhone, customerLocalCode]
  );
  const customerCreateDefaults = useMemo(
    () => ({
      name: customerName ?? "",
      document: digits(customerDocument),
      personType: inferPersonType(customerDocument),
      email: customerEmail ?? "",
      phone: digits(customerPhone),
      postalCode: digits(customerPostalCode),
      addressLine: customerAddressLine ?? "",
      addressNumber: customerAddressNumber ?? "",
      addressComplement: customerAddressComplement ?? "",
      district: customerDistrict ?? "",
      city: customerCity ?? "",
      state: customerState?.toUpperCase() ?? ""
    }),
    [
      customerAddressComplement,
      customerAddressLine,
      customerAddressNumber,
      customerCity,
      customerDistrict,
      customerDocument,
      customerEmail,
      customerName,
      customerPhone,
      customerPostalCode,
      customerState
    ]
  );

  async function execute(action: ActionKey, formData?: FormData) {
    const config = ACTIONS[action];
    const payload = buildPayload(action, formData, defaultCrmSubject);
    if ("error" in payload) {
      setMessage(payload.error);
      return;
    }

    setMessage("");
    setLoading(action);
    const response = await fetch(`/api/quotes/${quoteId}/olist/${config.url}`, {
      method: "POST",
      headers: payload.body ? { "content-type": "application/json" } : undefined,
      body: payload.body ? JSON.stringify(payload.body) : undefined
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      const errorMessage = data?.error ?? "Falha na integração.";
      setMessage(data?.debugId ? `${errorMessage} Debug: ${data.debugId}` : errorMessage);
      setActionResult({
        tone: "error",
        title: `${config.title} não concluído`,
        message: errorMessage,
        debugId: data?.debugId ?? null,
        summary: data?.responseSummary ?? null
      });
      return;
    }

    if (action === "customerLookup") {
      const found = Boolean(data.externalId);
      const lookupSummary = summarizeCustomer(data.result) ?? data.call?.summary ?? null;
      setCustomerLookup({
        status: found ? "found" : "not_found",
        externalId: data.externalId ?? null,
        summary: lookupSummary,
        criteria: data.lookup?.criteria ?? null,
        raw: data.result
      });
      const lookupMessage = data.message ?? (found ? `Cliente encontrado no Olist. ID: ${data.externalId}` : "Nenhum cliente correspondente foi encontrado no Olist. Você pode criar um novo cliente.");
      setMessage(lookupMessage);
      setActionResult(null);
      setPendingAction(null);
      router.refresh();
      return;
    }

    if (data.externalId) {
      if (action === "customer") {
        setCustomerExternalId(data.externalId);
        setCustomerLookup({
          status: "created",
          externalId: data.externalId,
          summary: summarizeCustomer(data.result) ?? data.call?.summary ?? null,
          raw: data.result
        });
      }
      if (action === "crm") setCrmExternalId(data.externalId);
      if (action === "salesOrder") setOrderExternalId(data.externalId);
      if (action === "invoice" && !invoiceExternalId) setInvoiceExternalId(data.externalId);
    }
    if (action === "fulfillment") {
      setFulfillmentState({
        status: data.fulfillmentStatus ?? "sent_to_fulfillment",
        sentAt: data.sentAt ?? new Date().toISOString()
      });
    }
    const successMessage = data.message ?? (data.externalId ? `${config.success} ID: ${data.externalId}` : config.success);
    setMessage(successMessage);
    setActionResult({
      tone: "success",
      title: config.title,
      message: successMessage,
      debugId: data.debugId ?? null,
      externalId: data.externalId ?? null,
      path: data.call?.path ?? null,
      summary: data.call?.summary ?? summarizeCustomer(data.result)
    });
    setPendingAction(null);
    router.refresh();
  }

  async function useFoundCustomer(externalId: string) {
    setMessage("");
    setUsingCustomer(true);
    const response = await fetch(`/api/quotes/${quoteId}/olist/customer/use`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalId })
    });
    const data = await response.json().catch(() => null);
    setUsingCustomer(false);

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Não foi possível vincular o cliente Olist.");
      return;
    }

    setCustomerExternalId(externalId);
    setMessage(data.message ?? `Cliente Olist vinculado. ID: ${externalId}.`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div>
        <p className="text-sm font-semibold text-white">Fluxo Olist</p>
        <p className="mt-1 flex items-start gap-2 text-xs text-zinc-500">
          <FileText className="mt-0.5 shrink-0" size={14} />
          Cada etapa usa os dados e preços deste orçamento. A próxima ação só libera quando a anterior estiver pronta.
        </p>
      </div>

      {customerLookup ? (
        <CustomerLookupResult
          activeExternalId={customerExternalId}
          loading={usingCustomer}
          lookup={customerLookup}
          onUseCustomer={useFoundCustomer}
        />
      ) : null}
      {actionResult ? <OlistActionResultPanel result={actionResult} /> : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <FlowAction
          description="Procura ou cadastra o contato usado no orçamento."
          disabled={!hasCustomer}
          done={customerReady}
          icon={<UserCheck size={16} />}
          loading={loading}
          onClick={setPendingAction}
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
          onClick={setPendingAction}
          primaryName="crm"
          title="2. Assunto CRM"
        />
        <FlowAction
          description="Adiciona uma próxima ação na agenda do assunto CRM."
          disabled={!crmReady}
          done={false}
          icon={<CalendarPlus size={16} />}
          loading={loading}
          onClick={setPendingAction}
          primaryName="crmTask"
          title="3. Tarefa CRM"
        />
        <FlowAction
          description="Gera o pedido de venda na Olist com SKU, quantidade e preço calculado."
          disabled={!customerReady}
          done={orderReady}
          icon={<ShoppingCart size={16} />}
          loading={loading}
          onClick={setPendingAction}
          primaryName="salesOrder"
          title="4. Pedido de venda"
        />
        <FlowAction
          description="Confirma que o pedido Olist está pronto para separação e envio."
          disabled={!orderReady}
          done={fulfillmentReady}
          icon={<Truck size={16} />}
          loading={loading}
          onClick={setPendingAction}
          primaryName="fulfillment"
          title="5. Expedição Olist"
        />
        <FlowAction
          description={invoiceReady ? "Autoriza a nota fiscal já gerada para este pedido." : "Gera a nota fiscal a partir do pedido de venda."}
          disabled={!orderReady}
          done={invoiceReady}
          icon={<ReceiptText size={16} />}
          label={invoiceReady ? "Autorizar nota Olist" : "Gerar nota Olist"}
          loading={loading}
          onClick={setPendingAction}
          primaryName="invoice"
          secondaryName={invoiceReady ? "invoiceCancel" : undefined}
          title="6. Nota fiscal"
        />
      </div>
      {message ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{message}</p> : null}

      {pendingAction ? (
        <ActionModal
          action={pendingAction}
          customerCreateDefaults={customerCreateDefaults}
          customerReady={customerReady}
          customerLookupDefaults={customerLookupDefaults}
          defaultCrmSubject={defaultCrmSubject}
          invoiceExternalId={invoiceExternalId}
          invoiceNumber={externalInvoiceNumber ?? null}
          invoiceSeries={externalInvoiceSeries ?? null}
          invoiceModel={externalInvoiceModel ?? null}
          invoiceReady={invoiceReady}
          fulfillmentNote={fulfillmentNote ?? null}
          fulfillmentReady={fulfillmentReady}
          fulfillmentSentAt={fulfillmentState.sentAt}
          orderExternalId={orderExternalId}
          shipments={shipments ?? []}
          loading={loading === pendingAction}
          onClose={() => setPendingAction(null)}
          onSubmit={(formData) => execute(pendingAction, formData)}
          quoteId={quoteId}
          responsibleUsers={responsibleUsers ?? []}
        />
      ) : null}
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

function ActionModal({
  action,
  customerCreateDefaults,
  customerReady,
  customerLookupDefaults,
  defaultCrmSubject,
  invoiceExternalId,
  invoiceNumber,
  invoiceSeries,
  invoiceModel,
  invoiceReady,
  fulfillmentNote,
  fulfillmentReady,
  fulfillmentSentAt,
  orderExternalId,
  shipments,
  loading,
  onClose,
  onSubmit,
  quoteId,
  responsibleUsers
}: {
  action: ActionKey;
  customerCreateDefaults: {
    name: string;
    document: string;
    personType: "F" | "J";
    email: string;
    phone: string;
    postalCode: string;
    addressLine: string;
    addressNumber: string;
    addressComplement: string;
    district: string;
    city: string;
    state: string;
  };
  customerReady: boolean;
  customerLookupDefaults: {
    name: string;
    firstName: string;
    document: string;
    phone: string;
    email: string;
    codigo: string;
  };
  defaultCrmSubject: string;
  invoiceExternalId: string | null;
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceModel: string | null;
  invoiceReady: boolean;
  fulfillmentNote: string | null;
  fulfillmentReady: boolean;
  fulfillmentSentAt: string | null;
  orderExternalId: string | null;
  shipments: ShipmentRow[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  quoteId: string;
  responsibleUsers: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}) {
  const config = ACTIONS[action];
  const [salesOrderPreview, setSalesOrderPreview] = useState<SalesOrderPreviewState>({
    loading: false,
    error: null,
    data: null
  });
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreviewState>({
    loading: false,
    error: null,
    data: null
  });
  const melhorEnvioShipment = useMemo(() => selectBestMelhorEnvioShipment(shipments), [shipments]);

  useEffect(() => {
    if (action !== "salesOrder") return;
    let cancelled = false;
    setSalesOrderPreview({ loading: true, error: null, data: null });
    fetch(`/api/quotes/${encodeURIComponent(quoteId)}/olist/sales-order/preview`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !data?.ok) {
          setSalesOrderPreview({
            loading: false,
            error: data?.error ?? "Não foi possível montar a prévia do pedido.",
            data: data ?? null
          });
          return;
        }
        setSalesOrderPreview({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (cancelled) return;
        setSalesOrderPreview({
          loading: false,
          error: error instanceof Error ? error.message : "Não foi possível montar a prévia do pedido.",
          data: null
        });
      });
    return () => {
      cancelled = true;
    };
  }, [action, quoteId]);

  useEffect(() => {
    if (action !== "invoice" && action !== "invoiceCancel") return;
    let cancelled = false;
    setInvoicePreview({ loading: true, error: null, data: null });
    fetch(`/api/quotes/${encodeURIComponent(quoteId)}/olist/invoice/preview`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !data?.ok) {
          setInvoicePreview({
            loading: false,
            error: data?.error ?? "Não foi possível montar a prévia da nota.",
            data: data ?? null
          });
          return;
        }
        setInvoicePreview({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (cancelled) return;
        setInvoicePreview({
          loading: false,
          error: error instanceof Error ? error.message : "Não foi possível montar a prévia da nota.",
          data: null
        });
      });
    return () => {
      cancelled = true;
    };
  }, [action, quoteId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form
        className={`flex max-h-[90vh] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50 ${action === "salesOrder" || action === "invoice" || action === "invoiceCancel" ? "max-w-4xl" : "max-w-xl"}`}
        onSubmit={submit}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <h3 className="text-base font-semibold text-white">
              {action === "invoice" && invoiceReady ? "Autorizar nota Olist" : config.title}
            </h3>
            <p className="mt-1 text-sm leading-5 text-zinc-500">{config.description}</p>
          </div>
          <button
            className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 gap-4 overflow-y-auto overflow-x-hidden p-5">
          {action === "customerLookup" ? (
            <div className="grid gap-4">
              <InfoBox title="Consulta sem alteração de dados">
                O sistema vai procurar um contato no Olist/Tiny usando os critérios abaixo. Você pode encurtar o nome ou ajustar o texto para compensar diferenças de cadastro.
              </InfoBox>
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-sm font-medium text-white">Valores que serão pesquisados</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="CPF/CNPJ" name="lookupDocument" defaultValue={customerLookupDefaults.document} />
                  <Input label="Telefone/celular" name="lookupPhone" defaultValue={customerLookupDefaults.phone} />
                  <Input label="E-mail" name="lookupEmail" defaultValue={customerLookupDefaults.email} />
                  <Input label="Código/local" name="lookupCodigo" defaultValue={customerLookupDefaults.codigo} />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Input label="Nome para busca" name="lookupName" defaultValue={customerLookupDefaults.name} />
                  <button
                    className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950"
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      const input = form?.elements.namedItem("lookupName");
                      if (input instanceof HTMLInputElement) input.value = customerLookupDefaults.firstName || customerLookupDefaults.name;
                    }}
                    type="button"
                  >
                    Usar primeiro nome
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Campo principal</span>
                    <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="lookupMode" defaultValue="auto">
                      <option value="auto">Automático: CPF/CNPJ, telefone, e-mail e nome</option>
                      <option value="nome">Nome</option>
                      <option value="cpfCnpj">CPF/CNPJ</option>
                      <option value="celular">Telefone/celular</option>
                      <option value="email">E-mail</option>
                      <option value="codigo">Código</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Situação</span>
                    <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="lookupStatus" defaultValue="">
                      <option value="">Todas</option>
                      <option value="B">B - Ativo</option>
                      <option value="A">A - Ativo com acesso</option>
                      <option value="I">I - Inativo</option>
                      <option value="E">E - Excluído</option>
                    </select>
                  </label>
                </div>
                <p className="text-xs leading-5 text-zinc-500">
                  No modo automático, o sistema prioriza CPF/CNPJ, depois telefone, e-mail, código e nome. A consulta usa apenas um campo principal para evitar filtros combinados demais.
                </p>
              </div>
            </div>
          ) : null}

          {action === "customer" ? (
            <div className="grid gap-4">
              <InfoBox title="Criação de contato">
                Confira os dados abaixo antes de criar o cliente no Olist/Tiny. Se algo estiver diferente, ajuste diretamente aqui; a alteração vale para esta criação.
              </InfoBox>
              <div className="grid gap-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Input label="Nome/Razão social" name="customerName" defaultValue={customerCreateDefaults.name} required />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Tipo de pessoa</span>
                    <select
                      className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                      name="customerPersonType"
                      defaultValue={customerCreateDefaults.personType}
                    >
                      <option value="F">Pessoa física</option>
                      <option value="J">Pessoa jurídica</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="CPF/CNPJ" name="customerDocument" defaultValue={customerCreateDefaults.document} />
                  <Input label="Telefone/celular" name="customerPhone" defaultValue={customerCreateDefaults.phone} />
                  <Input label="E-mail" name="customerEmail" defaultValue={customerCreateDefaults.email} type="email" />
                </div>
                <div className="grid gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Input label="CEP" name="customerPostalCode" defaultValue={customerCreateDefaults.postalCode} />
                  </div>
                  <div className="sm:col-span-4">
                    <Input label="Endereço" name="customerAddressLine" defaultValue={customerCreateDefaults.addressLine} />
                  </div>
                  <div className="sm:col-span-2">
                    <Input label="Número" name="customerAddressNumber" defaultValue={customerCreateDefaults.addressNumber} />
                  </div>
                  <div className="sm:col-span-2">
                    <Input label="Complemento" name="customerAddressComplement" defaultValue={customerCreateDefaults.addressComplement} />
                  </div>
                  <div className="sm:col-span-2">
                    <Input label="Bairro" name="customerDistrict" defaultValue={customerCreateDefaults.district} />
                  </div>
                  <div className="sm:col-span-4">
                    <Input label="Cidade" name="customerCity" defaultValue={customerCreateDefaults.city} />
                  </div>
                  <div className="sm:col-span-2">
                    <Input label="UF" name="customerState" defaultValue={customerCreateDefaults.state} />
                  </div>
                </div>
                <p className="text-xs leading-5 text-zinc-500">
                  O Olist receberá estes dados como contato em situação ativa. CPF/CNPJ e telefone serão enviados apenas com números.
                </p>
              </div>
            </div>
          ) : null}

          {action === "crm" ? (
            <div className="grid gap-3">
              <Input label="Descrição do assunto" name="description" defaultValue={defaultCrmSubject} required />
              <Input label="Data do assunto" name="date" type="date" />
              {!customerReady ? (
                <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  Consulte ou crie o cliente Olist antes de criar o assunto CRM.
                </p>
              ) : null}
            </div>
          ) : null}

          {action === "crmTask" ? (
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Descrição da tarefa</span>
                <textarea
                  className="focus-ring min-h-24 w-full rounded-md border border-zinc-700 px-3 py-2"
                  name="description"
                  placeholder="Ex.: Retornar orçamento ao cliente"
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Data prevista" name="dueDate" type="date" />
                <Input label="Horário" name="dueTime" type="time" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Responsável CRM</span>
                  <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="responsibleExternalId" defaultValue={responsibleUsers[0]?.id ?? ""}>
                    <option value="">Sem responsável</option>
                    {responsibleUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} - Olist {user.id}
                      </option>
                    ))}
                  </select>
                </label>
                <Input label="ID responsável manual" name="responsibleExternalIdManual" />
              </div>
              <p className="text-xs leading-5 text-zinc-500">
                Para aparecer na agenda de um usuário do CRM, vincule o usuário em Configurações &gt; Usuários &gt; Olist, ou informe manualmente o ID do responsável.
              </p>
            </div>
          ) : null}

          {action === "salesOrder" ? (
            <div className="grid gap-3">
              <InfoBox title="Pedido de venda">
                Esta ação usa cliente Olist, itens do orçamento, quantidades, preços finais, frete, desconto e IDs numéricos dos produtos Olist cadastrados em Produtos.
              </InfoBox>
              <SalesOrderPreviewPanel preview={salesOrderPreview} />
            </div>
          ) : null}

          {action === "fulfillment" ? (
            <div className="grid gap-4">
              <InfoBox title="Expedição do pedido">
                Esta etapa registra que o pedido de venda Olist está pronto para separação e envio. Ela não altera a nota fiscal nem compra etiqueta; a etiqueta Melhor Envio entra na próxima etapa logística.
              </InfoBox>
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoTile label="Pedido de venda Olist" value={stringValue(orderExternalId)} />
                  <InfoTile label="Status atual" value={fulfillmentReady ? "Enviado para expedição" : "Ainda não enviado"} />
                  <InfoTile label="Enviado em" value={formatDateTime(fulfillmentSentAt)} />
                  <InfoTile label="Próxima etapa" value="Comprar/gerar etiqueta de envio" />
                </div>
                <ShipmentInfoPanel shipment={melhorEnvioShipment} title="Etiqueta/frete vinculado à expedição" />
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Responsável pela expedição</span>
                  <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="responsibleExternalId" defaultValue={responsibleUsers[0]?.id ?? ""}>
                    <option value="">Sem responsável Olist definido</option>
                    {responsibleUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} - Olist {user.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Observação para expedição</span>
                  <textarea
                    className="focus-ring min-h-28 w-full rounded-md border border-zinc-700 px-3 py-2"
                    defaultValue={fulfillmentNote ?? "Separar produtos, conferir arte/quantidade e preparar envio conforme orçamento."}
                    name="fulfillmentNote"
                    required
                  />
                </label>
                <p className="text-xs leading-5 text-zinc-500">
                  O registro fica salvo no orçamento e no log de auditoria. Se futuramente a API do Olist liberar uma transição específica para expedição, este ponto do fluxo já está isolado para conectar esse endpoint.
                </p>
              </div>
            </div>
          ) : null}

          {action === "invoice" ? (
            <div className="grid gap-3">
              <InfoBox title={invoiceReady ? "Autorizar nota existente" : "Gerar nota fiscal"}>
                {invoiceReady
                  ? "A nota já foi gerada. Esta ação solicita a autorização/emissão no Olist/Tiny."
                  : "Esta ação gera uma nota fiscal a partir do pedido de venda Olist já criado."}
              </InfoBox>
              <InvoicePreviewPanel preview={invoicePreview} />
            </div>
          ) : null}

          {action === "invoiceCancel" ? (
            <div className="grid gap-3">
              <InfoBox title="Cancelamento de nota fiscal">
                A API v3 só cancela notas já autorizadas, porque exige o XML da nota fiscal. Se a nota ainda estiver pendente, autorize/emita a nota antes de solicitar o cancelamento.
              </InfoBox>
              <InvoiceCancelInfoPanel preview={invoicePreview} />
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoTile label="Orçamento" value={quoteId} />
                  <InfoTile label="ID interno da nota Olist" value={stringValue(invoiceExternalId)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Número da nota" name="numeroNota" defaultValue={invoiceNumber ?? ""} required />
                  <Input label="Série da nota" name="serieNota" defaultValue={invoiceSeries ?? ""} />
                  <Input label="Modelo" name="modeloNota" defaultValue={invoiceModel ?? "55"} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Estornar contas</span>
                    <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="estornarContas" defaultValue="N">
                      <option value="N">Não</option>
                      <option value="S">Sim</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Estornar estoque</span>
                    <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="estornarEstoque" defaultValue="N">
                      <option value="N">Não</option>
                      <option value="S">Sim</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Motivo do cancelamento</span>
                  <textarea
                    className="focus-ring min-h-28 w-full rounded-md border border-zinc-700 px-3 py-2"
                    name="cancelReason"
                    placeholder="Ex.: Cliente desistiu da compra antes do envio dos produtos."
                    required
                  />
                </label>
                <p className="text-xs leading-5 text-zinc-500">
                  {invoiceNumber
                    ? "Os dados fiscais foram preenchidos com o que ficou salvo após gerar/autorizar a nota. Confira antes de confirmar."
                    : "Ainda não temos o número fiscal salvo. Use o número fiscal da nota, não o ID interno. Se estiver em dúvida, confira a nota no painel do Olist/Tiny antes de confirmar."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-zinc-800 bg-zinc-950 p-5 sm:flex-row sm:justify-end">
          <button
            className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
            disabled={loading}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="focus-ring rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60"
            disabled={
              loading ||
              (action === "crm" && !customerReady) ||
              (action === "salesOrder" && (salesOrderPreview.loading || Boolean(salesOrderPreview.error))) ||
              (action === "fulfillment" && !orderExternalId) ||
              (action === "invoice" && (invoicePreview.loading || Boolean(invoicePreview.error))) ||
              (action === "invoiceCancel" && (!invoiceReady || invoicePreview.loading || Boolean(invoicePreview.error)))
            }
            type="submit"
          >
            {loading ? config.loading : config.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function SalesOrderPreviewPanel({ preview }: { preview: SalesOrderPreviewState }) {
  if (preview.loading) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
        Montando prévia do pedido com os dados atuais do orçamento...
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="grid gap-3 rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">
        <p className="font-semibold">Prévia do pedido não concluída</p>
        <p className="text-rose-100/80">{preview.error}</p>
        {preview.data?.missingSkus?.length ? (
          <div className="rounded-md bg-black/20 px-3 py-2 text-xs">
            <p className="font-semibold">Itens sem ID produto Olist</p>
            <ul className="mt-2 grid gap-1">
              {preview.data.missingSkus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const data = preview.data;
  const quote = data?.quote ?? {};
  const items = data?.items ?? [];
  const payload = data?.payload as Record<string, unknown> | null | undefined;

  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile label="Endpoint" value={`${data?.method ?? "POST"} ${data?.path ?? "-"}`} />
        <InfoTile label="Cliente Olist" value={stringValue(quote.customerExternalOlistId)} />
        <InfoTile label="Frete" value={currencyLike(quote.shippingTotal)} />
        <InfoTile label="Desconto" value={currencyLike(quote.discountTotal)} />
        <InfoTile label="Total do orçamento" value={currencyLike(quote.grandTotal)} />
        <InfoTile label="Validade" value={stringValue(quote.validUntil)} />
      </div>

      <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/60">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
          <p className="text-sm font-medium text-white">Itens enviados ao Olist</p>
          <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-400">{items.length} item(ns)</span>
        </div>
        <div className="grid gap-2 p-3">
          {items.length ? items.map((item, index) => (
            <details className="group min-w-0 rounded-md border border-zinc-800 bg-zinc-900/70 text-xs" key={String(item.id ?? index)}>
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-3 hover:bg-zinc-900">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {index + 1}. {String(item.description ?? "Item sem descrição")}
                  </span>
                  <span className="mt-1 block truncate text-xs text-zinc-500">
                    {stringValue(item.quantity)} un. x {currencyLike(item.unitPrice)} | ID Olist {stringValue(item.externalOlistProductId)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 group-open:hidden">
                  Abrir
                </span>
                <span className="hidden shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 group-open:inline">
                  Recolher
                </span>
              </summary>
              <div className="grid min-w-0 gap-2 border-t border-zinc-800 p-3 sm:grid-cols-3">
                <InfoTile compact label="ID produto Olist" value={stringValue(item.externalOlistProductId)} />
                <InfoTile compact label="SKU" value={stringValue(item.sku)} />
                <InfoTile compact label="Arte" value={stringValue(item.artworkName)} />
                <InfoTile compact label="Quantidade" value={stringValue(item.quantity)} />
                <InfoTile compact label="Preço unitário" value={currencyLike(item.unitPrice)} />
                <InfoTile compact label="Preço total" value={currencyLike(item.totalPrice)} />
              </div>
            </details>
          )) : (
            <p className="text-sm text-zinc-500">Nenhum item encontrado no orçamento.</p>
          )}
        </div>
      </div>

      <details className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/60">
        <summary className="focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900">
          Ver JSON que será enviado ao Olist
        </summary>
        <div className="max-w-full overflow-hidden border-t border-zinc-800">
          <pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-zinc-300">
          {JSON.stringify(payload ?? {}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}

function InvoicePreviewPanel({ preview }: { preview: InvoicePreviewState }) {
  if (preview.loading) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
        Montando prévia da nota fiscal com os dados atuais do orçamento...
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="grid gap-3 rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">
        <p className="font-semibold">Prévia da nota não concluída</p>
        <p className="text-rose-100/80">{preview.error}</p>
        {preview.data?.missingSkus?.length ? (
          <div className="rounded-md bg-black/20 px-3 py-2 text-xs">
            <p className="font-semibold">Itens sem ID produto Olist</p>
            <ul className="mt-2 grid gap-1">
              {preview.data.missingSkus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const data = preview.data;
  const quote = data?.quote ?? {};
  const items = data?.items ?? [];
  const payload = data?.payload as Record<string, unknown> | null | undefined;

  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile label="Operação" value={data?.mode === "emit" ? "Autorizar nota existente" : "Gerar nota fiscal"} />
        <InfoTile label="Endpoint" value={`${data?.method ?? "POST"} ${data?.path ?? "-"}`} />
        <InfoTile label="Pedido Olist" value={stringValue(quote.externalOlistOrderId)} />
        <InfoTile label="Nota Olist" value={stringValue(quote.externalOlistInvoiceId)} />
        <InfoTile label="Cliente Olist" value={stringValue(quote.customerExternalOlistId)} />
        <InfoTile label="Total da nota/orçamento" value={currencyLike(quote.grandTotal)} />
        <InfoTile label="Número fiscal" value={stringValue(quote.externalOlistInvoiceNumber)} />
        <InfoTile label="Série/modelo" value={`${stringValue(quote.externalOlistInvoiceSeries)} / ${stringValue(quote.externalOlistInvoiceModel)}`} />
      </div>

      <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
        <p className="text-sm font-medium text-white">Composição do valor herdada do pedido</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <InfoTile compact label="Produtos" value={currencyLike(quote.subtotal)} />
          <InfoTile compact label="Frete" value={currencyLike(quote.shippingTotal)} />
          <InfoTile compact label="Desconto" value={currencyLike(quote.discountTotal)} />
          <InfoTile compact label="Total" value={currencyLike(quote.grandTotal)} />
        </div>
      </div>

      <ShipmentInfoPanel
        shipment={preview.data?.shipment ?? null}
        title="Etiqueta/frete vinculado à nota"
      />

      {data?.mode === "create" ? (
        <>
          <InfoBox title="Como a Olist gera esta nota">
            O endpoint de geração da nota usa o pedido de venda Olist já criado. Por isso o JSON enviado agora é curto: os itens, preços, desconto e frete abaixo vêm do pedido Olist {stringValue(quote.externalOlistOrderId)}.
          </InfoBox>
          <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/60">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
              <p className="text-sm font-medium text-white">Itens usados como origem da nota</p>
              <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-400">{items.length} item(ns)</span>
            </div>
            <div className="grid gap-2 p-3">
              {items.length ? items.map((item, index) => (
                <details className="group min-w-0 rounded-md border border-zinc-800 bg-zinc-900/70 text-xs" key={String(item.id ?? index)}>
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-3 hover:bg-zinc-900">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {index + 1}. {String(item.description ?? "Item sem descrição")}
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {stringValue(item.quantity)} un. x {currencyLike(item.unitPrice)} | ID Olist {stringValue(item.externalOlistProductId)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 group-open:hidden">
                      Abrir
                    </span>
                    <span className="hidden shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 group-open:inline">
                      Recolher
                    </span>
                  </summary>
                  <div className="grid min-w-0 gap-2 border-t border-zinc-800 p-3 sm:grid-cols-3">
                    <InfoTile compact label="ID produto Olist" value={stringValue(item.externalOlistProductId)} />
                    <InfoTile compact label="SKU" value={stringValue(item.sku)} />
                    <InfoTile compact label="Arte" value={stringValue(item.artworkName)} />
                    <InfoTile compact label="Quantidade" value={stringValue(item.quantity)} />
                    <InfoTile compact label="Preço unitário" value={currencyLike(item.unitPrice)} />
                    <InfoTile compact label="Preço total" value={currencyLike(item.totalPrice)} />
                  </div>
                </details>
              )) : (
                <p className="text-sm text-zinc-500">Nenhum item encontrado no orçamento.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <InfoBox title="Autorização da nota">
          Esta etapa usa a nota já gerada no Olist e envia apenas a solicitação de emissão/autorização.
        </InfoBox>
      )}

      <details className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/60">
        <summary className="focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900">
          Ver JSON que será enviado ao Olist
        </summary>
        <div className="max-w-full overflow-hidden border-t border-zinc-800">
          <pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-zinc-300">
            {JSON.stringify(payload ?? {}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}

function InvoiceCancelInfoPanel({ preview }: { preview: InvoicePreviewState }) {
  if (preview.loading) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
        Carregando dados da nota fiscal...
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">
        <p className="font-semibold">Dados da nota indisponíveis</p>
        <p className="mt-1 text-rose-100/80">{preview.error}</p>
      </div>
    );
  }

  const quote = preview.data?.quote ?? {};

  return (
    <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-sm font-medium text-white">Nota que será cancelada</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile compact label="Nota Olist" value={stringValue(quote.externalOlistInvoiceId)} />
        <InfoTile compact label="Número fiscal" value={stringValue(quote.externalOlistInvoiceNumber)} />
        <InfoTile compact label="Série/modelo" value={`${stringValue(quote.externalOlistInvoiceSeries)} / ${stringValue(quote.externalOlistInvoiceModel)}`} />
        <InfoTile compact label="Pedido Olist" value={stringValue(quote.externalOlistOrderId)} />
        <InfoTile compact label="Cliente Olist" value={stringValue(quote.customerExternalOlistId)} />
        <InfoTile compact label="Produtos" value={currencyLike(quote.subtotal)} />
        <InfoTile compact label="Frete" value={currencyLike(quote.shippingTotal)} />
        <InfoTile compact label="Total" value={currencyLike(quote.grandTotal)} />
      </div>
    </div>
  );
}

function ShipmentInfoPanel({
  shipment,
  title
}: {
  shipment: ShipmentRow | Record<string, unknown> | null;
  title: string;
}) {
  const summary = summarizeShipmentForUi(shipment);

  if (!summary) {
    return (
      <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/80">
          Nenhuma etiqueta Melhor Envio está vinculada a este orçamento ainda. Gere a etiqueta após enviar para expedição para manter o frete e o rastreio conectados ao pedido.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-100">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-emerald-100/80">
          Estas informações são usadas como conferência operacional. A nota fiscal no Olist é gerada a partir do pedido de venda, então o frete fiscal continua vindo do pedido.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <InfoTile compact label="Serviço" value={summary.service} />
        <InfoTile compact label="Status etiqueta" value={summary.status} />
        <InfoTile compact label="Valor frete" value={currencyLike(summary.amount)} />
        <InfoTile compact label="Rastreio" value={summary.tracking} />
        <InfoTile compact label="Etiqueta" value={summary.labelUrl ? "Link/arquivo disponível" : "-"} />
        <InfoTile compact label="Caixa" value={summary.box} />
        <InfoTile compact label="Dimensões" value={summary.dimensions} />
        <InfoTile compact label="Peso bruto" value={summary.weight} />
        <InfoTile compact label="Volumes" value={summary.volumes} />
      </div>
    </div>
  );
}

function selectBestMelhorEnvioShipment(shipments: ShipmentRow[]) {
  const priority = new Map([
    ["printed", 6],
    ["label_generated", 5],
    ["paid", 4],
    ["cart", 3],
    ["quoted", 2],
    ["error", 1]
  ]);

  return shipments
    .filter((shipment) => shipment.provider === "melhor_envio")
    .sort((a, b) => (priority.get(b.status) ?? 0) - (priority.get(a.status) ?? 0))[0] ?? null;
}

function summarizeShipmentForUi(shipment: ShipmentRow | Record<string, unknown> | null) {
  if (!shipment) return null;
  const record = shipment as Record<string, unknown>;
  const packageRecord = record.package && typeof record.package === "object"
    ? record.package as Record<string, unknown>
    : null;
  const packagingSnapshot = record.packaging_snapshot && typeof record.packaging_snapshot === "object"
    ? record.packaging_snapshot as Record<string, unknown>
    : null;
  const box = packagingSnapshot?.box && typeof packagingSnapshot.box === "object"
    ? packagingSnapshot.box as Record<string, unknown>
    : null;

  const service = stringValue(record.serviceName ?? record.service_name ?? record.serviceCode ?? record.service_code ?? "Melhor Envio");
  const status = shipmentStatusLabel(stringValue(record.status));
  const amount = record.shippingAmount ?? record.shipping_amount;
  const tracking = stringValue(record.trackingCode ?? record.tracking_code);
  const labelUrl = stringValue(record.labelUrl ?? record.label_url) !== "-" ? stringValue(record.labelUrl ?? record.label_url) : "";
  const boxName = stringValue(packageRecord?.boxName ?? box?.name);
  const width = packageRecord?.widthCm ?? box?.widthCm;
  const length = packageRecord?.lengthCm ?? box?.lengthCm;
  const height = packageRecord?.heightCm ?? box?.heightCm;
  const grossWeight = packageRecord?.grossWeightKg ?? packagingSnapshot?.grossWeightKg;
  const boxesNeeded = packageRecord?.boxesNeeded ?? packagingSnapshot?.boxesNeeded;

  return {
    service,
    status,
    amount,
    tracking,
    labelUrl,
    box: boxName,
    dimensions: width && length && height ? `${width} x ${length} x ${height} cm` : "-",
    weight: grossWeight ? `${Number(grossWeight).toFixed(3)} kg` : "-",
    volumes: boxesNeeded ? String(boxesNeeded) : "-"
  };
}

function shipmentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    quoted: "Frete cotado",
    cart: "No carrinho",
    paid: "Etiqueta comprada",
    label_generated: "Etiqueta gerada",
    printed: "Pronta para impressão",
    posted: "Postado",
    delivered: "Entregue",
    error: "Erro"
  };
  return labels[status] ?? status;
}

function CustomerLookupResult({
  lookup,
  activeExternalId,
  loading,
  onUseCustomer
}: {
  lookup: CustomerLookupState;
  activeExternalId: string | null;
  loading: boolean;
  onUseCustomer: (externalId: string) => void;
}) {
  const title =
    lookup.status === "found"
      ? "Cliente encontrado no Olist"
      : lookup.status === "created"
        ? "Cliente criado no Olist"
        : "Cliente não encontrado no Olist";
  const tone =
    lookup.status === "not_found"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
      : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";

  return (
    <div className={`rounded-md border px-3 py-3 ${tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {lookup.externalId ? <p className="mt-1 text-xs opacity-80">ID Olist: {lookup.externalId}</p> : null}
        </div>
        {lookup.externalId ? (
          activeExternalId === lookup.externalId ? (
            <span className="w-fit rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
              Cliente em uso
            </span>
          ) : (
            <button
              className="focus-ring inline-flex min-h-9 w-fit items-center justify-center rounded-md border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-60"
              disabled={loading}
              onClick={() => onUseCustomer(lookup.externalId as string)}
              type="button"
            >
              {loading ? "Vinculando..." : "Usar este cliente"}
            </button>
          )
        ) : null}
      </div>
      {lookup.criteria ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          {Object.entries(lookup.criteria).map(([key, value]) => (
            <div className="rounded-md bg-black/20 px-2 py-2" key={key}>
              <dt className="text-[11px] uppercase tracking-wide opacity-60">{key}</dt>
              <dd className="mt-1 break-words font-medium">{String(value ?? "-")}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {lookup.summary ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {Object.entries(lookup.summary).map(([key, value]) => (
            <div className="rounded-md bg-black/20 px-2 py-2" key={key}>
              <dt className="text-[11px] uppercase tracking-wide opacity-60">{key}</dt>
              <dd className="mt-1 break-words font-medium">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs opacity-80">Nenhum contato correspondente foi retornado pela API.</p>
      )}
    </div>
  );
}

function InfoTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`min-w-0 rounded-md bg-black/20 ${compact ? "px-2 py-2" : "px-3 py-2"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function OlistActionResultPanel({ result }: { result: OlistActionResult }) {
  const tone =
    result.tone === "error"
      ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
      : result.tone === "info"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";

  return (
    <div className={`rounded-md border px-3 py-3 ${tone}`}>
      <p className="text-sm font-semibold">{result.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-85">{result.message}</p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {result.externalId ? (
          <div className="rounded-md bg-black/20 px-2 py-2">
            <span className="block text-[11px] uppercase tracking-wide opacity-60">ID externo</span>
            <span className="mt-1 block break-words font-medium">{result.externalId}</span>
          </div>
        ) : null}
        {result.debugId ? (
          <div className="rounded-md bg-black/20 px-2 py-2">
            <span className="block text-[11px] uppercase tracking-wide opacity-60">Debug</span>
            <span className="mt-1 block break-words font-medium">{result.debugId}</span>
          </div>
        ) : null}
        {result.path ? (
          <div className="rounded-md bg-black/20 px-2 py-2 sm:col-span-2">
            <span className="block text-[11px] uppercase tracking-wide opacity-60">Path usado</span>
            <span className="mt-1 block break-words font-medium">{result.path}</span>
          </div>
        ) : null}
      </div>
      {result.summary ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {Object.entries(result.summary).map(([key, value]) => (
            <div className="rounded-md bg-black/20 px-2 py-2" key={key}>
              <dt className="text-[11px] uppercase tracking-wide opacity-60">{key}</dt>
              <dd className="mt-1 break-words font-medium">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-sm text-cyan-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 leading-5 text-cyan-100/80">{children}</p>
    </div>
  );
}

function Input({
  label,
  name,
  defaultValue,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function buildPayload(action: ActionKey, formData: FormData | undefined, defaultCrmSubject: string): { body?: Record<string, unknown> } | { error: string } {
  if (action === "customerLookup") {
    const mode = stringField(formData, "lookupMode") || "auto";
    return {
      body: {
        mode,
        cpfCnpj: digits(stringField(formData, "lookupDocument")),
        celular: digits(stringField(formData, "lookupPhone")),
        email: stringField(formData, "lookupEmail"),
        codigo: stringField(formData, "lookupCodigo"),
        nome: stringField(formData, "lookupName"),
        situacao: stringField(formData, "lookupStatus")
      }
    };
  }

  if (action === "customer") {
    const name = stringField(formData, "customerName");
    const personType = stringField(formData, "customerPersonType");
    if (!name || name.length < 2) return { error: "Informe o nome do cliente para criar no Olist." };
    return {
      body: {
        name,
        personType: personType === "J" ? "J" : "F",
        document: digits(stringField(formData, "customerDocument")),
        email: stringField(formData, "customerEmail"),
        phone: digits(stringField(formData, "customerPhone")),
        postalCode: digits(stringField(formData, "customerPostalCode")),
        addressLine: stringField(formData, "customerAddressLine"),
        addressNumber: stringField(formData, "customerAddressNumber"),
        addressComplement: stringField(formData, "customerAddressComplement"),
        district: stringField(formData, "customerDistrict"),
        city: stringField(formData, "customerCity"),
        state: stringField(formData, "customerState").toUpperCase()
      }
    };
  }

  if (action === "crm") {
    const description = stringField(formData, "description") || defaultCrmSubject;
    const date = stringField(formData, "date");
    return { body: { description, date: date || undefined } };
  }

  if (action === "crmTask") {
    const description = stringField(formData, "description");
    const dueDate = stringField(formData, "dueDate");
    const dueTime = stringField(formData, "dueTime");
    const responsibleExternalId = stringField(formData, "responsibleExternalIdManual") || stringField(formData, "responsibleExternalId");
    if (!description || description.length < 3) return { error: "Informe uma descrição para a tarefa CRM." };
    return {
      body: {
        description,
        dueDate: dueDate || undefined,
        dueTime: dueTime || undefined,
        responsibleExternalId: responsibleExternalId || undefined
      }
    };
  }

  if (action === "fulfillment") {
    const note = stringField(formData, "fulfillmentNote");
    const responsibleExternalId = stringField(formData, "responsibleExternalId");
    if (note.length < 10) return { error: "Informe uma observação de expedição com pelo menos 10 caracteres." };
    return {
      body: {
        note,
        responsibleExternalId: responsibleExternalId || undefined
      }
    };
  }

  if (action === "invoiceCancel") {
    const reason = stringField(formData, "cancelReason");
    const numeroNota = stringField(formData, "numeroNota");
    const serieNota = stringField(formData, "serieNota");
    const modeloNota = stringField(formData, "modeloNota") || "55";
    const estornarContas = stringField(formData, "estornarContas") === "S" ? "S" : "N";
    const estornarEstoque = stringField(formData, "estornarEstoque") === "S" ? "S" : "N";
    if (reason.length < 15) return { error: "Informe um motivo de cancelamento com pelo menos 15 caracteres." };
    if (!numeroNota) return { error: "Informe o número da nota fiscal para cancelar." };
    return { body: { reason, numeroNota, serieNota, modeloNota, estornarContas, estornarEstoque } };
  }

  return {};
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function digits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function inferPersonType(value: string | null | undefined): "F" | "J" {
  return digits(value).length > 11 ? "J" : "F";
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function currencyLike(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return stringValue(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function stringField(formData: FormData | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function summarizeCustomer(data: unknown): Record<string, unknown> | null {
  const record = firstRecord(data);
  if (!record || typeof record !== "object") return null;
  const source = record as Record<string, unknown>;
  const summary = {
    nome: pickString(source, ["nome", "name", "razaoSocial"]),
    documento: pickString(source, ["cpfCnpj", "documento", "document"]),
    email: pickString(source, ["email"]),
    telefone: pickString(source, ["celular", "telefone", "phone"]),
    cidade: pickNestedString(source, ["endereco", "cidade", "municipio"]),
    situacao: pickString(source, ["situacao", "status"])
  };
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value));
}

function firstRecord(data: unknown): unknown {
  if (Array.isArray(data)) return data[0];
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.itens)) return record.itens[0];
  if (Array.isArray(record.items)) return record.items[0];
  if (record.data) return firstRecord(record.data);
  if (record.retorno) return firstRecord(record.retorno);
  return record;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function pickNestedString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = pickString(record, [key]);
    if (direct) return direct;
  }
  const address = record.endereco ?? record.address;
  if (address && typeof address === "object") {
    return pickString(address as Record<string, unknown>, keys);
  }
  return null;
}
