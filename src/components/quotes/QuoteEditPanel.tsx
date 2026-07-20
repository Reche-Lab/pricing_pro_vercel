"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Edit3, History, Lock, Save } from "lucide-react";
import type { QuoteDetail, QuoteEditLogRow, QuoteItemRow } from "@/repositories/quotes";

type QuoteEditVariant = {
  id: string;
  label: string;
  sku: string | null;
  externalOlistProductId: string | null;
};

type EditableItem = {
  id: string;
  productVariantId: string;
  quantity: number;
  unitPrice: number;
  artworkName: string;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function QuoteEditPanel({
  editLogs,
  items,
  quote,
  variants
}: {
  editLogs: QuoteEditLogRow[];
  items: QuoteItemRow[];
  quote: QuoteDetail;
  variants: QuoteEditVariant[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [validUntil, setValidUntil] = useState(formatDateInput(quote.valid_until));
  const [shippingTotal, setShippingTotal] = useState(Number(quote.shipping_total));
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [reason, setReason] = useState("");
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() => items.map((item) => ({
    id: item.id,
    productVariantId: item.product_variant_id ?? "",
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    artworkName: item.artwork_name ?? ""
  })));
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const blockedReason = editBlockedReason(quote);
  const changedPrice = useMemo(
    () => editableItems.some((item) => {
      const original = items.find((current) => current.id === item.id);
      return !original || Math.abs(Number(original.unit_price) - item.unitPrice) >= 0.0001;
    }),
    [editableItems, items]
  );
  const subtotal = editableItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = subtotal + shippingTotal - Number(quote.discount_total);

  async function saveEdit() {
    if (blockedReason || state === "saving") return;
    if (changedPrice && !reason.trim()) {
      setState("error");
      setMessage("Informe o motivo da alteração manual de preço.");
      return;
    }

    setState("saving");
    setMessage("");
    const response = await fetch(`/api/quotes/${quote.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        validUntil,
        shippingTotal,
        notes,
        reason,
        items: editableItems
      })
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      setState("error");
      setMessage(data?.error ?? "Não foi possível editar o orçamento.");
      return;
    }

    setState("success");
    setMessage(quote.external_olist_order_id
      ? "Orçamento atualizado e pedido Olist sincronizado."
      : "Orçamento atualizado.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <Edit3 className="text-amber-300" size={16} />
            Editar orçamento
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Ajuste produtos, quantidades, preço, frete, validade e observações antes de emitir nota fiscal.
          </p>
        </div>
        <button
          className="focus-ring inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-60"
          disabled={Boolean(blockedReason)}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          {blockedReason ? <Lock size={16} /> : <Edit3 size={16} />}
          {open ? "Fechar edição" : "Editar"}
        </button>
      </div>

      {blockedReason ? (
        <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {blockedReason}
        </p>
      ) : null}

      {open && !blockedReason ? (
        <div className="mt-4 grid gap-4">
          {quote.external_olist_order_id ? (
            <p className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
              Este orçamento já tem pedido de venda Olist. Ao salvar, o sistema atualiza primeiro os itens do pedido Olist e só depois grava o orçamento local.
            </p>
          ) : null}

          <div className="grid gap-3">
            {editableItems.map((item, index) => {
              const variant = variants.find((option) => option.id === item.productVariantId);
              const original = items.find((current) => current.id === item.id);
              const itemChangedPrice = original && Math.abs(Number(original.unit_price) - item.unitPrice) >= 0.0001;
              return (
                <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Item {index + 1}</p>
                    {itemChangedPrice || original?.manual_unit_price ? (
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-100">
                        Preço manual
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_110px_140px_1fr]">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Produto</span>
                      <select
                        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                        value={item.productVariantId}
                        onChange={(event) => updateItem(item.id, { productVariantId: event.currentTarget.value })}
                      >
                        {variants.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {variant ? (
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          SKU {variant.sku ?? "-"} · Olist {variant.externalOlistProductId ?? "-"}
                        </span>
                      ) : null}
                    </label>
                    <NumberField label="Qtd." min={1} step={1} value={item.quantity} onChange={(value) => updateItem(item.id, { quantity: Math.max(1, Math.trunc(value)) })} />
                    <NumberField label="Preço unitário" min={0} step={0.01} value={item.unitPrice} onChange={(value) => updateItem(item.id, { unitPrice: Math.max(0, value) })} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Arte/lote</span>
                      <input
                        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                        value={item.artworkName}
                        onChange={(event) => updateItem(item.id, { artworkName: event.currentTarget.value })}
                      />
                    </label>
                  </div>
                  <p className="text-right text-sm font-semibold text-white">
                    Total do item: {brl.format(item.quantity * item.unitPrice)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Validade</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.currentTarget.value)}
              />
            </label>
            <NumberField label="Frete" min={0} step={0.01} value={shippingTotal} onChange={setShippingTotal} />
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Total estimado</p>
              <p className="mt-1 text-lg font-semibold text-white">{brl.format(total)}</p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Observações</span>
            <textarea
              className="focus-ring min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </label>

          {changedPrice ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-amber-200">Motivo da alteração manual de preço</span>
              <textarea
                className="focus-ring min-h-20 w-full rounded-md border border-amber-400/30 bg-zinc-950 px-3 py-2 text-sm text-white"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Ex.: condição negociada com o cliente, ajuste comercial aprovado..."
              />
            </label>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {message ? (
              <p className={`rounded-md border px-3 py-2 text-xs ${
                state === "error"
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              }`}>
                {message}
              </p>
            ) : <span />}
            <button
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
              disabled={state === "saving"}
              type="button"
              onClick={saveEdit}
            >
              {state === "saving" ? <Save size={16} /> : <CheckCircle2 size={16} />}
              {state === "saving" ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
          <History size={15} />
          Histórico de alterações
        </p>
        {editLogs.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">Nenhuma edição registrada para este orçamento.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {editLogs.map((log) => (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400" key={log.id}>
                <p className="font-medium text-zinc-200">
                  {formatDateTime(log.created_at)} · {log.edited_by_name ?? "Usuário"}
                  {log.synced_olist_order_id ? ` · Pedido Olist ${log.synced_olist_order_id}` : ""}
                </p>
                {log.reason ? <p className="mt-1 text-amber-100">Motivo: {log.reason}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  function updateItem(itemId: string, patch: Partial<EditableItem>) {
    setEditableItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
    setState("idle");
    setMessage("");
  }
}

function NumberField({
  label,
  min,
  step,
  value,
  onChange
}: {
  label: string;
  min: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
        min={min}
        step={step}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function editBlockedReason(quote: QuoteDetail) {
  if (quote.external_olist_invoice_id) return "Este orçamento já possui nota fiscal Olist. Para alterar valores ou itens, crie um novo orçamento ou cancele/substitua a nota conforme o fluxo fiscal.";
  if (quote.public_accepted_at || quote.status === "accepted") return "Este orçamento já foi aceito pelo cliente. Para alterar condições, gere uma nova versão/orçamento.";
  return null;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}
