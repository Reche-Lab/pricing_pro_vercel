"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  ExternalLink,
  FileText,
  Lock,
  PackagePlus,
  Printer,
  Radar,
  RefreshCw,
  Truck,
  UserRoundPen,
  X
} from "lucide-react";
import type { ShipmentRow } from "@/repositories/shipments";

type QuoteOption = {
  code: string;
  name: string;
  companyName: string;
  label: string;
  price: number;
  deliveryTime: number | null;
};

type OperationKey = "cart" | "checkout" | "generate" | "print" | "tracking";
const PROTECTED_COMPLETED_OPERATIONS: OperationKey[] = ["cart", "checkout", "generate"];

const OPERATIONS: Array<{
  key: OperationKey;
  title: string;
  label: string;
  doneStatuses: string[];
  icon: typeof PackagePlus;
}> = [
  { key: "cart", title: "Carrinho", label: "Adicionar ao carrinho", doneStatuses: ["cart", "paid", "label_generated", "printed", "posted", "delivered"], icon: PackagePlus },
  { key: "checkout", title: "Compra", label: "Pagar com saldo Melhor Envio", doneStatuses: ["paid", "label_generated", "printed", "posted", "delivered"], icon: CreditCard },
  { key: "generate", title: "Etiqueta", label: "Gerar etiqueta", doneStatuses: ["label_generated", "printed", "posted", "delivered"], icon: FileText },
  { key: "print", title: "Impressão", label: "Imprimir etiqueta", doneStatuses: ["printed", "posted", "delivered"], icon: Printer },
  { key: "tracking", title: "Rastreio", label: "Atualizar rastreio", doneStatuses: ["posted", "delivered"], icon: Radar }
];

export function MelhorEnvioQuoteLabelActions({
  quoteId,
  quoteShippingTotal,
  shipments
}: {
  quoteId: string;
  quoteShippingTotal: number;
  shipments: ShipmentRow[];
}) {
  const router = useRouter();
  const initialShipments = useMemo(() => shipments.filter((shipment) => shipment.provider === "melhor_envio"), [shipments]);
  const [localShipments, setLocalShipments] = useState<ShipmentRow[]>(initialShipments);
  const [selectedShipmentId, setSelectedShipmentId] = useState(initialShipments[0]?.id ?? "");
  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([]);
  const [selectedServiceCode, setSelectedServiceCode] = useState("");
  const [manualShippingAmount, setManualShippingAmount] = useState(initialShipments[0] ? Number(initialShipments[0].shipping_amount) : quoteShippingTotal);
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ tone: "success" | "error" | "info"; title: string; message: string } | null>(null);
  const [completedOperation, setCompletedOperation] = useState<OperationKey | null>(null);
  const [hasCustomerValidationError, setHasCustomerValidationError] = useState(false);

  const selectedShipment = localShipments.find((shipment) => shipment.id === selectedShipmentId) ?? localShipments[0] ?? null;

  useEffect(() => {
    if (selectedShipment) {
      setManualShippingAmount(Number(selectedShipment.shipping_amount));
    }
  }, [selectedShipment]);

  useEffect(() => {
    if (!completedOperation) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setCompletedOperation(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [completedOperation]);

  async function refreshShipments(preferredShipmentId?: string) {
    const response = await fetch(`/api/quotes/${quoteId}/shipments`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) return;
    const melhorEnvioShipments = (Array.isArray(data.shipments) ? data.shipments : []).filter(
      (shipment: ShipmentRow) => shipment.provider === "melhor_envio"
    ) as ShipmentRow[];
    setLocalShipments(melhorEnvioShipments);
    const nextId = preferredShipmentId ?? selectedShipmentId;
    setSelectedShipmentId(melhorEnvioShipments.some((shipment) => shipment.id === nextId) ? nextId : melhorEnvioShipments[0]?.id ?? "");
  }

  async function quoteServices() {
    setLoading("quote");
    setMessage("");
    setResult(null);
    const response = await fetch(`/api/quotes/${quoteId}/melhor-envio/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      const error = data?.error ?? "Não foi possível cotar o Melhor Envio para este orçamento.";
      setResult({ tone: "error", title: "Cotação não concluída", message: error });
      return;
    }

    const options = Array.isArray(data.options) ? data.options as QuoteOption[] : [];
    setQuoteOptions(options);
    setSelectedServiceCode(options[0]?.code ?? "");
    setManualShippingAmount(options[0]?.price ?? quoteShippingTotal);
    setResult({
      tone: "success",
      title: "Cotação Melhor Envio pronta",
      message: options.length
        ? "Escolha o serviço que será usado para comprar e gerar a etiqueta."
        : "O Melhor Envio não retornou serviços disponíveis para este orçamento."
    });
  }

  async function saveSelectedService() {
    if (!selectedServiceCode) {
      setMessage("Selecione um serviço do Melhor Envio para continuar.");
      return;
    }

    setLoading("save-service");
    setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/melhor-envio/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedServiceCode })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok || !data.shipment?.id) {
      setResult({
        tone: "error",
        title: "Serviço não salvo",
        message: data?.error ?? "Não foi possível vincular o serviço ao orçamento."
      });
      return;
    }

    await refreshShipments(data.shipment.id);
    setResult({
      tone: "success",
      title: "Serviço vinculado",
      message: "O serviço selecionado agora é a base para comprar, gerar e imprimir a etiqueta."
    });
    router.refresh();
  }

  async function runOperation(operation: OperationKey) {
    if (!selectedShipment) {
      setMessage("Cote e selecione um serviço Melhor Envio antes de emitir etiqueta.");
      return;
    }

    setLoading(operation);
    setMessage("");
    setResult(null);
    setHasCustomerValidationError(false);

    const payloadResponse = await fetch(`/api/shipments/${selectedShipment.id}/melhor-envio/payload?operation=${operation}`);
    const payloadData = await payloadResponse.json().catch(() => null);
    if (!payloadResponse.ok || !payloadData?.ok) {
      setLoading("");
      setResult({
        tone: "error",
        title: "Payload não preparado",
        message: payloadData?.error ?? "Não foi possível preparar os dados para o Melhor Envio."
      });
      return;
    }

    if (Array.isArray(payloadData.missingFields) && payloadData.missingFields.length > 0) {
      setLoading("");
      const missingFields = payloadData.missingFields as string[];
      setHasCustomerValidationError(missingFields.some((field) => field.startsWith("customer.")));
      setResult({
        tone: "error",
        title: "Dados incompletos para etiqueta",
        message: `Complete os campos obrigatórios antes de continuar: ${missingFields.map(missingFieldLabel).join(", ")}.`
      });
      return;
    }

    const response = await fetch(`/api/shipments/${selectedShipment.id}/melhor-envio/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: payloadData.payload })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setResult({
        tone: "error",
        title: operationTitle(operation, false),
        message: data?.error ?? "A operação no Melhor Envio não foi concluída."
      });
      return;
    }

    await refreshShipments(selectedShipment.id);
    setResult({
      tone: "success",
      title: operationTitle(operation, true),
      message: operationSuccessMessage(operation)
    });
    router.refresh();
  }

  return (
    <div className="grid min-w-0 gap-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Truck className="text-cyan-300" size={16} />
            7. Etiqueta Melhor Envio
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Emita a etiqueta usando os itens, endereço do cliente, caixa calculada e serviço de envio selecionado neste orçamento.
          </p>
          <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
            A etapa de compra usa o saldo da conta Melhor Envio conectada. Para adicionar saldo ou alterar forma de pagamento, acesse sua conta Melhor Envio.
          </p>
        </div>
        {selectedShipment ? (
          <span className="w-fit rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
            {statusLabel(selectedShipment.status)}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
        {localShipments.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Serviço Melhor Envio vinculado</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
              onChange={(event) => setSelectedShipmentId(event.currentTarget.value)}
              value={selectedShipment?.id ?? ""}
            >
              {localShipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.service_name ?? shipment.service_code ?? "Melhor Envio"} - {currency(shipment.shipping_amount)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-zinc-300">
              Este orçamento ainda não tem um serviço Melhor Envio vinculado. Faça a cotação e escolha a opção que será usada para a etiqueta.
            </p>
            <button
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-center text-sm font-medium text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60 sm:w-fit"
              disabled={loading === "quote"}
              onClick={quoteServices}
              type="button"
            >
              <RefreshCw size={16} />
              {loading === "quote" ? "Cotando..." : "Cotar Melhor Envio"}
            </button>
          </div>
        )}

        {quoteOptions.length > 0 ? (
          <div className="grid gap-3 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-cyan-100">Escolha o tipo de envio</span>
              <select
                className="focus-ring w-full rounded-md border border-cyan-300/30 bg-zinc-950 px-3 py-2 text-cyan-50"
                onChange={(event) => {
                  const nextCode = event.currentTarget.value;
                  const option = quoteOptions.find((item) => item.code === nextCode);
                  setSelectedServiceCode(nextCode);
                  if (option) setManualShippingAmount(option.price);
                }}
                value={selectedServiceCode}
              >
                {quoteOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label} - {currency(option.price)}{option.deliveryTime ? ` - ${option.deliveryTime} dia(s)` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-center text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60 sm:w-fit"
              disabled={loading === "save-service"}
              onClick={saveSelectedService}
              type="button"
            >
              <CheckCircle2 size={16} />
              {loading === "save-service" ? "Salvando..." : "Usar este serviço na etiqueta"}
            </button>
          </div>
        ) : null}

        {selectedShipment ? (
          <>
            <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-4">
              <Info label="Serviço" value={selectedShipment.service_name ?? selectedShipment.service_code ?? "Melhor Envio"} />
              <Info label="Valor" value={currency(selectedShipment.shipping_amount)} />
              <Info label="Rastreio" value={selectedShipment.tracking_code ?? "-"} />
              <Info label="Etiqueta" value={selectedShipment.label_url ? "Disponível" : "-"} />
            </div>
            <div className="grid gap-3 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 md:grid-cols-[minmax(0,220px)_auto_1fr] md:items-end">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-amber-100">Frete no orçamento</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-amber-300/30 bg-zinc-950 px-3 text-sm text-white"
                  min={0}
                  step={0.01}
                  type="number"
                  value={Number.isFinite(manualShippingAmount) ? manualShippingAmount : 0}
                  onChange={(event) => setManualShippingAmount(Number(event.currentTarget.value))}
                />
              </label>
              <button
                className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-center text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60 md:w-fit"
                disabled={loading === "quote-shipping-update"}
                onClick={applyShippingToQuote}
                type="button"
              >
                <CheckCircle2 size={16} />
                {loading === "quote-shipping-update" ? "Atualizando..." : quoteShippingTotal > 0 ? "Atualizar frete do orçamento" : "Incluir frete no orçamento"}
              </button>
              <p className="text-xs leading-5 text-amber-100/80">
                Valor atual salvo no orçamento: <strong>{currency(quoteShippingTotal)}</strong>. Ajuste o valor se precisar repassar um frete diferente da cotação.
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5">
        {OPERATIONS.map((operation, index) => {
          const done = selectedShipment ? operationDone(selectedShipment, operation.key) : false;
          const previous = OPERATIONS[index - 1];
          const previousDone = !previous || (selectedShipment ? operationDone(selectedShipment, previous.key) : false);
          const disabled = !selectedShipment || (!previousDone && operation.key !== "cart") || loading === operation.key;
          const actionLabel = completedOperationLabel(operation.key, done, Boolean(selectedShipment?.label_url));
          const Icon = operation.icon;
          return (
            <button
              className={`focus-ring grid min-h-24 gap-2 rounded-md border p-2.5 text-left text-xs transition-colors disabled:opacity-60 sm:min-h-28 sm:p-3 ${
                done
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
              }`}
              disabled={disabled}
              key={operation.key}
              onClick={() => {
                if (done && PROTECTED_COMPLETED_OPERATIONS.includes(operation.key)) {
                  setCompletedOperation(operation.key);
                  return;
                }
                if (done && operation.key === "print" && selectedShipment?.label_url) {
                  const url = safeHttpUrl(selectedShipment.label_url);
                  if (url) {
                    window.open(url, "_blank", "noopener,noreferrer");
                    return;
                  }
                }
                runOperation(operation.key);
              }}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <Icon className={done ? "text-emerald-300" : disabled ? "text-zinc-600" : "text-cyan-300"} size={16} />
                {done ? <CheckCircle2 className="text-emerald-300" size={16} /> : disabled ? <Lock size={15} /> : null}
              </span>
              <span className="font-medium text-white">{index + 1}. {operation.title}</span>
              <span>{loading === operation.key ? "Executando..." : actionLabel}</span>
            </button>
          );
        })}
      </div>

      {result ? <ResultBox result={result} /> : null}
      {hasCustomerValidationError ? (
        <button
          className="focus-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-rose-300/30 bg-rose-400/10 px-3 text-sm font-medium text-rose-100 hover:bg-rose-400/15"
          onClick={() => window.dispatchEvent(new Event("quote-customer-delivery:open"))}
          type="button"
        >
          <UserRoundPen size={16} />
          Completar dados do cliente
        </button>
      ) : null}
      {selectedShipment && (selectedShipment.label_url || selectedShipment.tracking_code) ? (
        <ShipmentReadyDetails shipment={selectedShipment} />
      ) : null}
      {message ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{message}</p> : null}
      {completedOperation && selectedShipment ? (
        <CompletedOperationModal
          operation={completedOperation}
          shipment={selectedShipment}
          onClose={() => setCompletedOperation(null)}
        />
      ) : null}
    </div>
  );

  async function applyShippingToQuote() {
    const amount = Math.max(0, Number.isFinite(manualShippingAmount) ? manualShippingAmount : 0);
    setLoading("quote-shipping-update");
    setMessage("");
    setResult(null);

    const response = await fetch(`/api/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shippingTotal: amount })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setResult({
        tone: "error",
        title: "Frete não atualizado",
        message: data?.error ?? "Não foi possível incluir o frete no orçamento."
      });
      return;
    }

    setResult({
      tone: "success",
      title: "Frete atualizado no orçamento",
      message: `O orçamento foi atualizado com frete de ${currency(amount)}.`
    });
    router.refresh();
  }
}

function operationDone(shipment: ShipmentRow, operation: OperationKey) {
  const config = OPERATIONS.find((item) => item.key === operation);
  if (!config) return false;
  if (operation === "cart" && shipment.provider_shipment_id) return true;
  if (operation === "tracking" && shipment.tracking_code) return true;
  return config.doneStatuses.includes(shipment.status);
}

function completedOperationLabel(operation: OperationKey, done: boolean, hasLabelUrl: boolean) {
  if (!done) return OPERATIONS.find((item) => item.key === operation)?.label ?? operation;
  const labels: Record<OperationKey, string> = {
    cart: "Concluído · ver detalhes",
    checkout: "Pagamento confirmado · ver detalhes",
    generate: "Etiqueta gerada · ver detalhes",
    print: hasLabelUrl ? "Abrir etiqueta" : "Obter link de impressão",
    tracking: "Atualizar rastreio"
  };
  return labels[operation];
}

function operationTitle(operation: OperationKey, success: boolean) {
  const titles: Record<OperationKey, string> = {
    cart: success ? "Envio adicionado ao carrinho" : "Carrinho não concluído",
    checkout: success ? "Etiqueta comprada com saldo Melhor Envio" : "Compra não concluída",
    generate: success ? "Etiqueta gerada" : "Geração não concluída",
    print: success ? "Etiqueta pronta para impressão" : "Impressão não concluída",
    tracking: success ? "Rastreio atualizado" : "Rastreio não concluído"
  };
  return titles[operation];
}

function operationSuccessMessage(operation: OperationKey) {
  const messages: Record<OperationKey, string> = {
    cart: "O envio foi adicionado ao carrinho do Melhor Envio.",
    checkout: "A compra da etiqueta foi solicitada usando o saldo disponível na conta Melhor Envio conectada.",
    generate: "A etiqueta foi gerada. Agora você pode imprimir.",
    print: "A impressão foi solicitada. Se a API retornar link/arquivo, ele ficará salvo no envio.",
    tracking: "A consulta de rastreio foi atualizada no envio."
  };
  return messages[operation];
}

function statusLabel(status: string) {
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

function missingFieldLabel(field: string) {
  const labels: Record<string, string> = {
    "customer.name": "nome do cliente",
    "customer.phone": "telefone do cliente",
    "customer.document": "CPF/CNPJ do cliente",
    "customer.postal_code": "CEP de entrega",
    "customer.address_line": "endereço de entrega",
    "customer.address_number": "número do endereço",
    "customer.district": "bairro",
    "customer.city": "cidade",
    "customer.state": "UF",
    "tenant.name": "nome do remetente",
    "tenant.company_phone": "telefone do remetente",
    "tenant.company_document": "CPF/CNPJ do remetente",
    "tenant.postal_code": "CEP do remetente",
    "tenant.address_line": "endereço do remetente",
    "tenant.address_number": "número do remetente",
    "tenant.district": "bairro do remetente",
    "tenant.city": "cidade do remetente",
    "tenant.state": "UF do remetente",
    "shipment.service_code": "serviço de envio",
    "shipment.volumes": "embalagem e peso"
  };
  return labels[field] ?? field;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-black/20 px-2 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 truncate font-medium text-zinc-200">{value}</p>
    </div>
  );
}

function ResultBox({ result }: { result: { tone: "success" | "error" | "info"; title: string; message: string } }) {
  const tone =
    result.tone === "error"
      ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
      : result.tone === "info"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  return (
    <div className={`rounded-md border px-3 py-3 ${tone}`}>
      <p className="text-sm font-semibold">{result.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-85">{result.message}</p>
    </div>
  );
}

function CompletedOperationModal({
  onClose,
  operation,
  shipment
}: {
  onClose: () => void;
  operation: OperationKey;
  shipment: ShipmentRow;
}) {
  const content: Record<"cart" | "checkout" | "generate", { title: string; message: string; warning: string }> = {
    cart: {
      title: "Envio já adicionado ao carrinho",
      message: "Esta etapa foi concluída e o identificador do envio já está salvo neste orçamento.",
      warning: "Adicionar novamente criaria outro item no carrinho do Melhor Envio."
    },
    checkout: {
      title: "Compra já realizada",
      message: "O pagamento da etiqueta já foi confirmado e registrado neste orçamento.",
      warning: "A compra não pode ser executada novamente, pois poderia gerar uma cobrança duplicada."
    },
    generate: {
      title: "Etiqueta já gerada",
      message: "A etiqueta deste envio já foi gerada com sucesso no Melhor Envio.",
      warning: "Para corrigir serviço, endereço ou embalagem, será necessário criar um novo envio."
    }
  };
  const detail = content[operation as keyof typeof content] ?? content.generate;

  return (
    <div
      aria-labelledby="completed-operation-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg border border-emerald-400/25 bg-zinc-950 p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
              <CheckCircle2 size={19} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Etapa concluída</p>
              <h3 className="mt-1 text-lg font-semibold text-white" id="completed-operation-title">
                {detail.title}
              </h3>
            </div>
          </div>
          <button
            aria-label="Fechar"
            className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-zinc-300">{detail.message}</p>
        <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {detail.warning}
        </p>

        <dl className="mt-4 grid gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Serviço</dt>
            <dd className="truncate font-medium text-zinc-200">
              {shipment.service_name ?? shipment.service_code ?? "Melhor Envio"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Status atual</dt>
            <dd className="font-medium text-emerald-300">{statusLabel(shipment.status)}</dd>
          </div>
          {shipment.provider_order_id ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">Pedido Melhor Envio</dt>
              <dd className="truncate font-mono text-zinc-300">{shipment.provider_order_id}</dd>
            </div>
          ) : null}
        </dl>

        <button
          className="focus-ring mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200"
          onClick={onClose}
          type="button"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

function ShipmentReadyDetails({ shipment }: { shipment: ShipmentRow }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const labelUrl = safeHttpUrl(shipment.label_url);

  async function copyTrackingCode() {
    if (!shipment.tracking_code) return;
    try {
      await navigator.clipboard.writeText(shipment.tracking_code);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-50">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={19} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {labelUrl ? "Etiqueta pronta para impressão" : "Código de rastreio disponível"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-emerald-100/75">
            Estes dados estão salvos no orçamento e continuarão disponíveis quando você voltar a esta tela.
          </p>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {labelUrl ? (
              <div className="grid gap-2 rounded-md border border-emerald-300/20 bg-zinc-950/35 p-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/65">
                    Etiqueta Melhor Envio
                  </p>
                  <p className="mt-1 text-xs text-emerald-50/80">Abra o arquivo para visualizar e imprimir.</p>
                </div>
                <a
                  className="focus-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-200"
                  href={labelUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={16} />
                  Abrir etiqueta para impressão
                </a>
              </div>
            ) : null}

            {shipment.tracking_code ? (
              <div className="grid gap-2 rounded-md border border-emerald-300/20 bg-zinc-950/35 p-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/65">
                    Código de rastreio
                  </p>
                  <p className="mt-1 break-all font-mono text-base font-semibold text-white">
                    {shipment.tracking_code}
                  </p>
                </div>
                <button
                  className="focus-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-emerald-300/30 px-3 py-2 text-sm font-medium text-emerald-50 transition-colors hover:bg-emerald-300/10"
                  onClick={copyTrackingCode}
                  type="button"
                >
                  <ClipboardCopy size={16} />
                  {copyState === "copied"
                    ? "Código copiado"
                    : copyState === "error"
                      ? "Não foi possível copiar"
                      : "Copiar código"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function currency(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}
