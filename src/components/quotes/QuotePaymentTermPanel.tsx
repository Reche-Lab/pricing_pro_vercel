"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CreditCard, RotateCcw, Save } from "lucide-react";

type PaymentOption = {
  kind: "payment_method" | "receiving_method" | "category";
  externalId: string;
  name: string;
  groupName: string | null;
};

type PaymentTerm = {
  payment_method_external_id: string | null;
  payment_method_name: string | null;
  receiving_method_external_id: string | null;
  receiving_method_name: string | null;
  category_external_id: string | null;
  category_name: string | null;
  installments_count: number;
  notes: string | null;
};

export function QuotePaymentTermPanel({
  defaultCategory,
  initialPaymentTerm,
  options,
  quoteId,
  total
}: {
  defaultCategory: { externalId: string; name: string };
  initialPaymentTerm: PaymentTerm | null;
  options: PaymentOption[];
  quoteId: string;
  total: number;
}) {
  const [paymentOptions, setPaymentOptions] = useState(options);
  const [paymentMethodId, setPaymentMethodId] = useState(initialPaymentTerm?.payment_method_external_id ?? "");
  const [categoryId, setCategoryId] = useState(initialPaymentTerm?.category_external_id ?? defaultCategory.externalId ?? "");
  const [installmentsCount, setInstallmentsCount] = useState(initialPaymentTerm?.installments_count ?? 1);
  const [firstDueDays, setFirstDueDays] = useState(0);
  const [intervalDays, setIntervalDays] = useState(30);
  const [notes, setNotes] = useState(initialPaymentTerm?.notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "syncing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const paymentMethods = useMemo(() => paymentOptions.filter((option) => option.kind === "payment_method"), [paymentOptions]);
  const categories = useMemo(() => paymentOptions.filter((option) => option.kind === "category"), [paymentOptions]);
  const selectedPaymentMethod = paymentMethods.find((option) => option.externalId === paymentMethodId) ?? null;
  const selectedCategory = categories.find((option) => option.externalId === categoryId) ?? (defaultCategory.externalId ? {
    kind: "category" as const,
    externalId: defaultCategory.externalId,
    name: defaultCategory.name || "Categoria padrão",
    groupName: null
  } : null);
  const showInstallments = shouldShowPaymentInstallments(selectedPaymentMethod?.name);
  const paymentTerm = buildPaymentTermPayload({
    total,
    paymentMethod: selectedPaymentMethod,
    category: selectedCategory,
    installmentsCount: showInstallments ? installmentsCount : 1,
    firstDueDays,
    intervalDays: showInstallments ? intervalDays : 0,
    notes
  });
  const selected = Boolean(paymentTerm);

  async function syncOptions() {
    setState("syncing");
    setMessage("Sincronizando opções do Olist...");
    const response = await fetch("/api/olist/payment-options/sync", { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setState("error");
      setMessage(data?.error ?? "Não foi possível sincronizar opções do Olist.");
      return;
    }
    const nextOptions = (data.options ?? []).map((option: Record<string, unknown>) => ({
      kind: option.kind,
      externalId: option.external_id,
      name: option.name,
      groupName: option.group_name ?? null
    })).filter((option: PaymentOption) => option.kind && option.externalId && option.name);
    setPaymentOptions(nextOptions);
    setState("idle");
    setMessage(`Opções sincronizadas: ${nextOptions.length}.`);
  }

  async function save() {
    if (!paymentTerm || state === "saving") {
      setState("error");
      setMessage("Selecione pelo menos uma forma de pagamento ou recebimento.");
      return;
    }
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/payment-term`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(paymentTerm)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setState("error");
      setMessage(data?.error ?? "Não foi possível salvar a condição de pagamento.");
      return;
    }
    setState("success");
    setMessage("Condição salva. O pedido de venda Olist usará essas informações.");
  }

  async function setCategoryAsDefault() {
    const category = categories.find((option) => option.externalId === categoryId);
    if (!category) {
      setState("error");
      setMessage("Selecione uma categoria para definir como padrão.");
      return;
    }
    setState("saving");
    const response = await fetch("/api/olist/payment-options/default-category", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryExternalId: category.externalId, categoryName: category.name })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setState("error");
      setMessage(data?.error ?? "Não foi possível definir categoria padrão.");
      return;
    }
    setState("success");
    setMessage("Categoria definida como padrão para os próximos pedidos.");
  }

  return (
    <section className={`rounded-lg border p-4 ${
      selected
        ? "border-emerald-400/25 bg-emerald-400/10"
        : "border-amber-400/35 bg-amber-400/10"
    }`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="focus-ring min-w-0 rounded-md text-left"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <p className={`inline-flex items-center gap-2 text-sm font-semibold ${selected ? "text-emerald-100" : "text-amber-100"}`}>
            {selected ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
            Pagamento do pedido Olist
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {selectedPaymentMethod?.name
              ? `${selectedPaymentMethod.name}${selectedCategory?.name ? ` · ${selectedCategory.name}` : ""}`
              : "Ainda não selecionado. Será exigido ao gerar pedido de venda."}
          </p>
        </button>
        <div className="flex items-center gap-2">
          <button
            className="focus-ring inline-flex h-8 w-fit items-center justify-center rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
            type="button"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Recolher" : "Configurar"}
          </button>
          <button
            className="focus-ring inline-flex h-8 w-fit items-center justify-center gap-2 rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-60"
            disabled={state === "syncing"}
            type="button"
            onClick={syncOptions}
          >
            <RotateCcw size={13} />
            {state === "syncing" ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-zinc-800/70 pt-3">
          <p className="text-xs text-zinc-400">
            Obrigatório para gerar pedido de venda no Olist; a nota fiscal herdará essa condição.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectOption label="Forma de pagamento" options={paymentMethods} placeholder={paymentMethods.length ? "Selecione" : "Sincronize"} value={paymentMethodId} onChange={setPaymentMethodId} />
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
              <span className="block font-medium text-zinc-300">Categoria padrão</span>
              <span className="mt-1 block">{selectedCategory?.name ?? "Não definida"}</span>
            </div>
            {showInstallments ? <NumberInput label="Parcelas" max={24} min={1} value={installmentsCount} onChange={setInstallmentsCount} /> : null}
            <NumberInput label="1º vencimento em dias" min={0} value={firstDueDays} onChange={setFirstDueDays} />
            {showInstallments ? <NumberInput label="Intervalo entre parcelas" min={0} value={intervalDays} onChange={setIntervalDays} /> : null}
          </div>
          <details className="rounded-md border border-zinc-800 bg-zinc-950/40">
            <summary className="focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-900">
              Categoria avançada
            </summary>
            <div className="grid gap-2 border-t border-zinc-800 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <SelectOption label="Categoria do pedido" options={categories} placeholder="Usar padrão" value={categoryId} onChange={setCategoryId} />
              <button
                className="focus-ring inline-flex h-10 items-center justify-center rounded-md border border-emerald-400/30 px-3 text-xs font-medium text-emerald-100 hover:bg-emerald-400/10"
                type="button"
                onClick={setCategoryAsDefault}
              >
                Definir como padrão
              </button>
            </div>
          </details>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Observação financeira</span>
            <input
              className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs ${state === "error" ? "text-rose-200" : "text-zinc-400"}`}>
              {message || (selected ? "Condição pronta para o pedido Olist." : "Pagamento ainda não selecionado.")}
            </p>
            <button
              className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
              disabled={state === "saving"}
              type="button"
              onClick={save}
            >
              <Save size={15} />
              {state === "saving" ? "Salvando..." : "Salvar pagamento"}
            </button>
          </div>
        </div>
      ) : message ? (
        <p className={`mt-2 text-xs ${state === "error" ? "text-rose-200" : "text-zinc-400"}`}>{message}</p>
      ) : null}
    </section>
  );
}

function SelectOption({
  label,
  options,
  placeholder,
  value,
  onChange
}: {
  label: string;
  options: PaymentOption[];
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <select
        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={`${option.kind}-${option.externalId}`} value={option.externalId}>
            {option.groupName ? `${option.name} - ${option.groupName}` : option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
  label,
  max,
  min,
  value,
  onChange
}: {
  label: string;
  max?: number;
  min: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, Number(event.currentTarget.value))))}
      />
    </label>
  );
}

function buildPaymentTermPayload({
  category,
  firstDueDays,
  installmentsCount,
  intervalDays,
  notes,
  paymentMethod,
  total
}: {
  category: PaymentOption | null;
  firstDueDays: number;
  installmentsCount: number;
  intervalDays: number;
  notes: string;
  paymentMethod: PaymentOption | null;
  total: number;
}) {
  if (!paymentMethod && !category) return null;
  const count = Math.max(1, Math.min(24, Math.trunc(installmentsCount || 1)));
  const totalCents = Math.max(0, Math.round(total * 100));
  const baseCents = Math.floor(totalCents / count);
  const today = new Date();
  const installments = Array.from({ length: count }, (_, index) => {
    const days = Math.max(0, Math.trunc(firstDueDays || 0)) + index * Math.max(0, Math.trunc(intervalDays || 0));
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + days);
    const cents = index === count - 1 ? totalCents - baseCents * (count - 1) : baseCents;
    return {
      installmentNumber: index + 1,
      dueDate: dueDate.toISOString().slice(0, 10),
      days,
      amount: cents / 100,
      notes: notes.trim() || `Parcela ${index + 1}/${count}`,
      paymentMethodExternalId: paymentMethod?.externalId ?? null,
      paymentMethodName: paymentMethod?.name ?? null,
      receivingMethodExternalId: null,
      receivingMethodName: null
    };
  });

  return {
    paymentMethodExternalId: paymentMethod?.externalId ?? null,
    paymentMethodName: paymentMethod?.name ?? null,
    receivingMethodExternalId: null,
    receivingMethodName: null,
    categoryExternalId: category?.externalId ?? null,
    categoryName: category?.name ?? null,
    installmentsCount: count,
    notes: notes.trim() || null,
    installments
  };
}

function shouldShowPaymentInstallments(name: string | null | undefined) {
  const normalized = normalizeText(name ?? "");
  return normalized.includes("cartao de credito") || normalized.includes("credito") || normalized.includes("link de pagamento");
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
