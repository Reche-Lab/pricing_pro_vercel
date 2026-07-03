"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  Circle,
  FileText,
  Lock,
  ReceiptText,
  Send,
  ShoppingCart,
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
  invoice: {
    url: "invoice",
    title: "Nota fiscal Olist",
    description: "Gera ou autoriza a nota fiscal relacionada ao pedido de venda.",
    success: "Emissão de nota solicitada.",
    label: "Emitir nota",
    loading: "Emitindo...",
    submitLabel: "Continuar"
  }
} as const;

type ActionKey = keyof typeof ACTIONS;
type LookupStatus = "found" | "not_found" | "created";

type CustomerLookupState = {
  status: LookupStatus;
  externalId: string | null;
  summary: Record<string, unknown> | null;
  raw: unknown;
};

export function OlistQuoteActions({
  quoteId,
  hasCustomer,
  customerName,
  customerDocument,
  customerPhone,
  externalOlistId,
  externalCrmId,
  externalOrderId,
  externalInvoiceId
}: {
  quoteId: string;
  hasCustomer: boolean;
  customerName?: string | null;
  customerDocument?: string | null;
  customerPhone?: string | null;
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
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [customerLookup, setCustomerLookup] = useState<CustomerLookupState | null>(null);

  const customerReady = Boolean(customerExternalId);
  const crmReady = Boolean(crmExternalId);
  const orderReady = Boolean(orderExternalId);
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
      phone: digits(customerPhone)
    }),
    [customerName, customerDocument, customerPhone]
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
      setMessage(data?.debugId ? `${data?.error ?? "Falha na integração."} Debug: ${data.debugId}` : data?.error ?? "Falha na integração.");
      return;
    }

    if (action === "customerLookup") {
      const found = Boolean(data.externalId);
      setCustomerLookup({
        status: found ? "found" : "not_found",
        externalId: data.externalId ?? null,
        summary: summarizeCustomer(data.result),
        raw: data.result
      });
      if (found) setCustomerExternalId(data.externalId);
      setMessage(found ? `Cliente encontrado no Olist. ID: ${data.externalId}` : "Nenhum cliente correspondente foi encontrado no Olist. Você pode criar um novo cliente.");
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
          summary: summarizeCustomer(data.result),
          raw: data.result
        });
      }
      if (action === "crm") setCrmExternalId(data.externalId);
      if (action === "salesOrder") setOrderExternalId(data.externalId);
      if (action === "invoice" && !invoiceExternalId) setInvoiceExternalId(data.externalId);
    }
    setMessage(data.externalId ? `${config.success} ID: ${data.externalId}` : config.success);
    setPendingAction(null);
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

      {customerLookup ? <CustomerLookupResult lookup={customerLookup} /> : null}

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
          description={invoiceReady ? "Autoriza a nota fiscal já gerada para este pedido." : "Gera a nota fiscal a partir do pedido de venda."}
          disabled={!orderReady}
          done={invoiceReady}
          icon={<ReceiptText size={16} />}
          label={invoiceReady ? "Autorizar nota Olist" : "Gerar nota Olist"}
          loading={loading}
          onClick={setPendingAction}
          primaryName="invoice"
          title="5. Nota fiscal"
        />
      </div>
      {message ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{message}</p> : null}

      {pendingAction ? (
        <ActionModal
          action={pendingAction}
          customerReady={customerReady}
          customerLookupDefaults={customerLookupDefaults}
          defaultCrmSubject={defaultCrmSubject}
          invoiceReady={invoiceReady}
          loading={loading === pendingAction}
          onClose={() => setPendingAction(null)}
          onSubmit={(formData) => execute(pendingAction, formData)}
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
  customerReady,
  customerLookupDefaults,
  defaultCrmSubject,
  invoiceReady,
  loading,
  onClose,
  onSubmit
}: {
  action: ActionKey;
  customerReady: boolean;
  customerLookupDefaults: {
    name: string;
    firstName: string;
    document: string;
    phone: string;
  };
  defaultCrmSubject: string;
  invoiceReady: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const config = ACTIONS[action];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form
        className="w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
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

        <div className="grid gap-4 p-5">
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
                    <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="lookupMode" defaultValue="nome">
                      <option value="nome">Nome</option>
                      <option value="cpfCnpj">CPF/CNPJ</option>
                      <option value="celular">Telefone/celular</option>
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
                  A consulta usa apenas o campo principal escolhido para evitar filtros combinados demais. Deixe situação como “Todas” quando não souber se o contato está como B ou A no Olist.
                </p>
              </div>
            </div>
          ) : null}

          {action === "customer" ? (
            <InfoBox title="Criação de contato">
              Se o contato ainda não existir, ele será criado no Olist/Tiny com os dados cadastrados neste orçamento.
            </InfoBox>
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
              <Input label="Data prevista" name="dueAt" type="date" />
            </div>
          ) : null}

          {action === "salesOrder" ? (
            <InfoBox title="Pedido de venda">
              Esta ação usa os itens do orçamento, quantidades, preços finais e IDs numéricos de produto Olist/Tiny cadastrados como SKU.
            </InfoBox>
          ) : null}

          {action === "invoice" ? (
            <InfoBox title={invoiceReady ? "Autorizar nota existente" : "Gerar nota fiscal"}>
              {invoiceReady
                ? "A nota já foi gerada. Esta ação solicita a autorização/emissão no Olist/Tiny."
                : "Esta ação gera uma nota fiscal a partir do pedido de venda Olist já criado."}
            </InfoBox>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 p-5 sm:flex-row sm:justify-end">
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
            disabled={loading || (action === "crm" && !customerReady)}
            type="submit"
          >
            {loading ? config.loading : config.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function CustomerLookupResult({ lookup }: { lookup: CustomerLookupState }) {
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
      <p className="text-sm font-semibold">{title}</p>
      {lookup.externalId ? <p className="mt-1 text-xs opacity-80">ID Olist: {lookup.externalId}</p> : null}
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
    const mode = stringField(formData, "lookupMode") || "nome";
    return {
      body: {
        mode,
        cpfCnpj: digits(stringField(formData, "lookupDocument")),
        celular: digits(stringField(formData, "lookupPhone")),
        nome: stringField(formData, "lookupName"),
        situacao: stringField(formData, "lookupStatus")
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
    const dueAt = stringField(formData, "dueAt");
    if (!description || description.length < 3) return { error: "Informe uma descrição para a tarefa CRM." };
    return { body: { description, dueAt: dueAt || undefined } };
  }

  return {};
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function digits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
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
