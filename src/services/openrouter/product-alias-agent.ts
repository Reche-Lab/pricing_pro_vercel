import { normalizeProductAliases } from "@/domain/products/product-search";
import { getServerEnv } from "@/lib/env/server";

export type ProductAliasSuggestionInput = {
  productName: string;
  variantName: string;
  category: string;
  description?: string | null;
  sku?: string | null;
  currentAliases?: string[];
};

export async function suggestProductAliases(input: ProductAliasSuggestionInput) {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("Configure OPENROUTER_API_KEY para gerar sugestões de aliases.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${env.OPENROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "HTTP-Referer": env.APP_URL,
        "X-OpenRouter-Title": "Pricing Pro"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_TEXT_MODEL,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: "Você sugere termos alternativos para busca em catálogo brasileiro. Não invente produtos, tamanhos, materiais ou características. Responda somente JSON válido."
          },
          { role: "user", content: buildProductAliasPrompt(input) }
        ]
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(readError(payload) || `OpenRouter respondeu com status ${response.status}.`);
    }
    return parseProductAliasSuggestions(readMessageText(payload), input.currentAliases ?? []);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildProductAliasPrompt(input: ProductAliasSuggestionInput) {
  return [
    "Sugira até 15 aliases curtos que um cliente brasileiro poderia usar para encontrar exatamente esta variante.",
    "Inclua erros ortográficos comuns, sinônimos realmente equivalentes e variações de medida em cm e mm.",
    "Não inclua o SKU, não mude a variante e não sugira produtos relacionados.",
    `Produto: ${input.productName}`,
    `Variante: ${input.variantName}`,
    `Categoria: ${input.category}`,
    `Descrição: ${input.description?.trim() || "não informada"}`,
    `SKU (somente contexto): ${input.sku?.trim() || "não informado"}`,
    `Aliases já cadastrados: ${(input.currentAliases ?? []).join(", ") || "nenhum"}`,
    'Formato obrigatório: {"aliases":["termo 1","termo 2"]}'
  ].join("\n");
}

export function parseProductAliasSuggestions(text: string, currentAliases: string[] = []) {
  const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(json) as { aliases?: unknown };
  const values = Array.isArray(parsed.aliases) ? parsed.aliases.filter((value): value is string => typeof value === "string") : [];
  const current = new Set(normalizeProductAliases(currentAliases.map((alias) => ({ alias }))).map((alias) => alias.normalizedAlias));
  return normalizeProductAliases(values.map((alias) => ({ alias, source: "ai" as const })), 15)
    .filter((alias) => !current.has(alias.normalizedAlias))
    .map((alias) => alias.alias);
}

function readMessageText(payload: unknown) {
  const record = asRecord(payload);
  const choice = Array.isArray(record?.choices) ? asRecord(record.choices[0]) : null;
  const message = asRecord(choice?.message);
  if (typeof message?.content !== "string") throw new Error("O OpenRouter não retornou aliases válidos.");
  return message.content;
}

function readError(payload: unknown) {
  const error = asRecord(asRecord(payload)?.error);
  return typeof error?.message === "string" ? error.message : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
