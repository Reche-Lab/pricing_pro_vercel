"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Edit3, History, Lock, Save } from "lucide-react";
import type { QuoteDetail, QuoteEditLogRow, QuoteItemRow } from "@/repositories/quotes";

export type QuoteEditVariant = {
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
  quote
}: {
  editLogs: QuoteEditLogRow[];
  items: QuoteItemRow[];
  quote: QuoteDetail;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [validUntil, setValidUntil] = useState(formatDateInput(quote.valid_until));
  const [shippingTotal, setShippingTotal] = useState(Number(quote.shipping_total));
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const blockedReason = editBlockedReason(quote);
  const subtotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
  const total = subtotal + shippingTotal - Number(quote.discount_total);

  async function saveEdit() {
    if (blockedReason || state === "saving") return;
    setState("saving");
    setMessage("");

    const response = await fetch(`/api/quotes/${quote.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        validUntil,
        shippingTotal,
        notes,
        reason: null,
        items: items.map(toEditableItem)
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
      ? "Condições atualizadas e pedido Olist sincronizado."
      : "Condições atualizadas.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <Edit3 className="text-amber-300" size={15} />
            Editar condições
          </p>
          <p className="mt-1 text-xs text-zinc-500">Validade, frete e observações do orçamento.</p>
        </div>
        <button
          className="focus-ring inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-60"
          disabled={Boolean(blockedReason)}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          {blockedReason ? <Lock size={14} /> : <Edit3 size={14} />}
          {open ? "Fechar" : "Editar"}
        </button>
      </div>

      {blockedReason ? (
        <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {blockedReason}
        </p>
      ) : null}

      {open && !blockedReason ? (
        <div className="mt-3 grid gap-3">
          {quote.external_olist_order_id ? (
            <p className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
              Este orçamento já tem pedido Olist. Ao salvar, as condições também passam pelo fluxo de sincronização.
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[160px_150px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Validade</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                type="date"
                value={validUntil}
                onChange={(event) => {
                  setValidUntil(event.currentTarget.value);
                  resetMessage();
                }}
              />
            </label>
            <NumberField label="Frete" min={0} step={0.01} value={shippingTotal} onChange={(value) => {
              setShippingTotal(value);
              resetMessage();
            }} />
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Total estimado</p>
              <p className="mt-1 text-lg font-semibold text-white">{brl.format(total)}</p>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Observações</span>
            <textarea
              className="focus-ring min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              value={notes}
              onChange={(event) => {
                setNotes(event.currentTarget.value);
                resetMessage();
              }}
            />
          </label>
          <SaveFooter message={message} state={state} onSave={saveEdit} />
        </div>
      ) : null}

      <div className="mt-3 border-t border-zinc-800 pt-3">
        <button
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
          type="button"
          onClick={() => setHistoryOpen((current) => !current)}
        >
          <History size={14} />
          Histórico de alterações ({editLogs.length})
        </button>
        {historyOpen ? <EditHistory editLogs={editLogs} /> : null}
      </div>
    </section>
  );

  function resetMessage() {
    setState("idle");
    setMessage("");
  }
}

export function QuoteItemEditPanel({
  items,
  quote,
  variants
}: {
  items: QuoteItemRow[];
  quote: QuoteDetail;
  variants: QuoteEditVariant[];
}) {
  const router = useRouter();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableItem | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const blockedReason = editBlockedReason(quote);
  const original = draft ? items.find((item) => item.id === draft.id) ?? null : null;
  const changedPrice = Boolean(original && draft && Math.abs(Number(original.unit_price) - draft.unitPrice) >= 0.0001);
  const selectedVariant = draft ? variants.find((variant) => variant.id === draft.productVariantId) : null;

  async function saveItem() {
    if (!draft || blockedReason || state === "saving") return;
    if (changedPrice && !reason.trim()) {
      setState("error");
      setMessage("Informe o motivo da alteração manual de preço.");
      return;
    }

    setState("saving");
    setMessage("");
    const payloadItems = items.map((item) => item.id === draft.id ? draft : toEditableItem(item));
    const response = await fetch(`/api/quotes/${quote.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        validUntil: formatDateInput(quote.valid_until),
        shippingTotal: Number(quote.shipping_total),
        notes: quote.notes ?? "",
        reason,
        items: payloadItems
      })
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      setState("error");
      setMessage(data?.error ?? "Não foi possível editar o item.");
      return;
    }

    setState("success");
    setMessage(quote.external_olist_order_id ? "Item atualizado e pedido Olist sincronizado." : "Item atualizado.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">Editar item individual</h2>
          <p className="text-xs text-zinc-500">Altere um produto, quantidade, preço ou arte sem abrir a edição completa.</p>
        </div>
        {blockedReason ? <Lock className="text-amber-300" size={17} /> : null}
      </div>
      {blockedReason ? (
        <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {blockedReason}
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {items.map((item, index) => (
            <div className="rounded-md border border-zinc-800 bg-zinc-950/45 p-3" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{index + 1}. {item.description}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.quantity} x {brl.format(Number(item.unit_price))} · {brl.format(Number(item.total_price))}
                  </p>
                  {item.manual_unit_price ? <p className="mt-1 text-xs text-amber-200">Preço manual registrado</p> : null}
                </div>
                <button
                  className="focus-ring inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-900"
                  type="button"
                  onClick={() => {
                    setEditingItemId(editingItemId === item.id ? null : item.id);
                    setDraft(toEditableItem(item));
                    setReason("");
                    setState("idle");
                    setMessage("");
                  }}
                >
                  <Edit3 size={13} />
                  Editar
                </button>
              </div>

              {editingItemId === item.id && draft ? (
                <div className="mt-3 grid gap-3 border-t border-zinc-800 pt-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-400">Produto</span>
                    <select
                      className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                      value={draft.productVariantId}
                      onChange={(event) => updateDraft({ productVariantId: event.currentTarget.value })}
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.label}</option>
                      ))}
                    </select>
                    {selectedVariant ? (
                      <span className="mt-1 block text-[11px] text-zinc-500">
                        SKU {selectedVariant.sku ?? "-"} · Olist {selectedVariant.externalOlistProductId ?? "-"}
                      </span>
                    ) : null}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <NumberField label="Qtd." min={1} step={1} value={draft.quantity} onChange={(value) => updateDraft({ quantity: Math.max(1, Math.trunc(value)) })} />
                    <NumberField label="Preço unitário" min={0} step={0.01} value={draft.unitPrice} onChange={(value) => updateDraft({ unitPrice: Math.max(0, value) })} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Arte/lote</span>
                      <input
                        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                        value={draft.artworkName}
                        onChange={(event) => updateDraft({ artworkName: event.currentTarget.value })}
                      />
                    </label>
                  </div>
                  <p className="text-right text-sm font-semibold text-white">
                    Novo total: {brl.format(draft.quantity * draft.unitPrice)}
                  </p>
                  {changedPrice ? (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-amber-200">Motivo da alteração manual de preço</span>
                      <textarea
                        className="focus-ring min-h-20 w-full rounded-md border border-amber-400/30 bg-zinc-950 px-3 py-2 text-sm text-white"
                        value={reason}
                        onChange={(event) => {
                          setReason(event.currentTarget.value);
                          resetMessage();
                        }}
                        placeholder="Ex.: condição negociada com o cliente, ajuste comercial aprovado..."
                      />
                    </label>
                  ) : null}
                  <SaveFooter message={message} state={state} onSave={saveItem} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  function updateDraft(patch: Partial<EditableItem>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    resetMessage();
  }

  function resetMessage() {
    setState("idle");
    setMessage("");
  }
}

function SaveFooter({
  message,
  onSave,
  state
}: {
  message: string;
  onSave: () => void;
  state: "idle" | "saving" | "success" | "error";
}) {
  return (
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
        onClick={onSave}
      >
        {state === "saving" ? <Save size={16} /> : <CheckCircle2 size={16} />}
        {state === "saving" ? "Salvando..." : "Salvar alterações"}
      </button>
    </div>
  );
}

function EditHistory({ editLogs }: { editLogs: QuoteEditLogRow[] }) {
  if (editLogs.length === 0) {
    return <p className="mt-2 text-xs text-zinc-500">Nenhuma edição registrada para este orçamento.</p>;
  }

  return (
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
  );
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

function toEditableItem(item: QuoteItemRow): EditableItem {
  return {
    id: item.id,
    productVariantId: item.product_variant_id ?? "",
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    artworkName: item.artwork_name ?? ""
  };
}

function editBlockedReason(quote: QuoteDetail) {
  if (quote.external_olist_invoice_id) return "Este orçamento já possui nota fiscal Olist. Para alterar valores ou itens, crie um novo orçamento ou cancele/substitua a nota conforme o fluxo fiscal.";
  if (quote.public_accepted_at || quote.status === "accepted") return "Este orçamento já foi aceito pelo cliente. Para alterar condições, gere uma nova versão/orçamento.";
  return null;
}

function formatDateInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: unknown) {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(value);
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "-");
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}
