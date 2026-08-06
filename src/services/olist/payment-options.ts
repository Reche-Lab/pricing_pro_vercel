import type { OlistPaymentOptionKind } from "@/repositories/olist-payment-options";

export type NormalizedOlistPaymentOption = {
  kind: OlistPaymentOptionKind;
  externalId: string;
  name: string;
  groupName: string | null;
  raw: Record<string, unknown>;
};

const COLLECTION_KEYS = [
  "itens",
  "items",
  "data",
  "retorno",
  "formasRecebimento",
  "formas_recebimento",
  "formasPagamento",
  "formas_pagamento",
  "categorias",
  "categoriasReceitaDespesa"
] as const;

export function extractOlistPaymentOptions(
  data: unknown,
  kind: OlistPaymentOptionKind
): NormalizedOlistPaymentOption[] {
  return records(data)
    .map((record) => normalizeOption(record, kind))
    .filter((option): option is NormalizedOlistPaymentOption => Boolean(option));
}

function normalizeOption(record: unknown, kind: OlistPaymentOptionKind): NormalizedOlistPaymentOption | null {
  if (!record || typeof record !== "object") return null;
  const item = record as Record<string, unknown>;
  const id = stringValue(item.id ?? item.codigo ?? item.idFormaRecebimento ?? item.idFormaPagamento);
  const name = stringValue(item.nome ?? item.descricao ?? item.name);
  if (!id || !name) return null;

  return {
    kind,
    externalId: id,
    name,
    groupName: stringValue(item.grupo ?? item.group ?? item.categoria),
    raw: item
  };
}

function records(data: unknown, depth = 0): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 4) return [];

  const record = data as Record<string, unknown>;
  for (const key of COLLECTION_KEYS) {
    if (!(key in record)) continue;
    const nested = records(record[key], depth + 1);
    if (nested.length > 0) return nested;
  }

  return [];
}

function stringValue(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
