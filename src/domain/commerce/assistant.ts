import { z } from "zod";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreShippingOption } from "./shipping-options";
import type { DeliveryEstimate } from "@/domain/shipping/production-lead-time";

export const assistantSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60).default("Assistente da loja"),
  welcome: z.string().trim().min(10).max(350).default("Olá! Posso ajudar a escolher produtos, preparar sua arte ou montar um orçamento. O que você tem em mente?"),
  tone: z.enum(["friendly", "consultative", "professional"]).default("friendly"),
  about: z.string().trim().max(1500).default(""),
  businessHours: z.string().trim().max(200).default(""),
  retentionDays: z.number().int().min(1).max(90).default(30),
  faq: z.array(z.object({ question: z.string().trim().min(3).max(120), answer: z.string().trim().min(3).max(600) }).strict()).max(10).default([]),
  allowQuotes: z.boolean().default(true), allowOrders: z.boolean().default(true),
  company: z.object({ legalName: z.string().trim().max(150).default(""), document: z.string().trim().max(30).default(""), address: z.string().trim().max(300).default(""), bankName: z.string().trim().max(100).default(""), agency: z.string().trim().max(30).default(""), account: z.string().trim().max(50).default(""), accountType: z.string().trim().max(50).default(""), beneficiary: z.string().trim().max(150).default(""), pixKey: z.string().trim().max(150).default("") }).strict().default({}),
}).strict();
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;
export const assistantLimitsSchema = z.object({
  allowed: z.boolean(), model: z.string().trim().min(3).max(150).regex(/^[\w./:-]+$/),
  monthlyCalls: z.number().int().min(0).max(100000), monthlyTokens: z.number().int().min(0).max(100000000),
  monthlyUsd: z.number().min(0).max(10000), visitorDailyTurns: z.number().int().min(1).max(100),
  revision: z.number().int().nonnegative(),
}).strict();
export type AssistantLimits = z.infer<typeof assistantLimitsSchema>;
export type AssistantDocument = { id: string; label: string; file_name: string; file_size: number; visibility: "public" | "identified"; created_at: string; active?: boolean };
export type AssistantProduct = Pick<ReturnType<typeof publicCommerceProduct>, "id" | "name" | "description" | "category" | "imageUrl" | "unitCents" | "minQuantity" | "maxQuantity" | "maxArtworks" | "personalized">;
export type AssistantCard =
  | { kind: "products"; products: AssistantProduct[]; clarification?: boolean }
  | { kind: "proposal"; desiredQuantities?: boolean; actionId: string; items: { name: string; quantity: number; artworkName: string; unitCents: number; totalCents: number }[]; totalCents: number; expiresAt: string }
  | { kind: "cart"; items: { name: string; quantity: number; artworkName: string; unitCents: number; totalCents: number }[]; totalCents: number }
  | { kind: "shipping"; options: (StoreShippingOption & { estimate: DeliveryEstimate })[]; warnings: string[] }
  | { kind: "company"; company: AssistantSettings["company"]; documents: AssistantDocument[] }
  | { kind: "orders"; orders: { id: string; totalCents: number; payment: string; fulfillment: string; createdAt: string }[] }
  | { kind: "quotes"; quotes: { id: string; totalCents: number; createdAt: string }[] }
  | { kind: "guide"; topic: "artwork" | "shopping" | "policies" }
  | { kind: "handoff"; summary: string }
  | { kind: "login" }
  | { kind: "quote_saved"; quoteId: string; totalCents: number }
  | { kind: "quote_continue" };
export type AssistantMessage = { id: string; role: "user" | "assistant"; text: string; cards: AssistantCard[] };
export const assistantProposalSchema = z.object({ items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50000), artworks: z.number().int().min(1).max(10).default(1), artworkName: z.string().trim().max(80).default("") }).strict()).min(1).max(10) }).strict();
export type AssistantProposalInput = z.infer<typeof assistantProposalSchema>;
export const assistantRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resume") }).strict(),
  z.object({ action: z.literal("start"), consent: z.literal(true) }).strict(),
  z.object({ action: z.literal("message"), conversationId: z.string().uuid(), messageId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("confirm"), conversationId: z.string().uuid(), actionId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("handoff"), conversationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("clear"), conversationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("quote_saved"), conversationId: z.string().uuid(), quoteId: z.string().uuid() }).strict(),
]);

export function redactAssistantText(text: string, limit = 3000) {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail ocultado]")
    .replace(/\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b/g, "[documento ocultado]")
    .replace(/\b\d{2}[. ]?\d{3}[. ]?\d{3}[\s/]?\d{4}[- ]?\d{2}\b/g, "[documento ocultado]")
    .replace(/\b\d{10,19}\b/g, "[número sensível ocultado]")
    .replace(/(?:\+\d{1,3}[\s-]*)?\(?\d{2}\)?[\s-]+\d{4,5}[\s-]?\d{4}\b/g, "[telefone ocultado]")
    .replace(/^\s*\d{6}\s*$/, "[possível código de acesso ocultado]")
    .replace(/(?:senha|password|c[oó]digo (?:de acesso|de verifica[çc][aã]o))\s*[:=]?\s*\S+/gi, "[credencial ocultada]").slice(0, limit);
}
export function isQuoteContinuationRequest(text: string, quoteContext = false) {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[.!?]+$/, "").trim();
  const beginning = "(?:(?:sim|ok|certo|perfeito|beleza)[, ]+)?(?:(?:pode|podemos|vamos|quero|desejo|gostaria de)\\s+)?";
  const action = "(?:seguir|continuar|prosseguir|finalizar|gerar|emitir|formalizar)";
  return new RegExp(`^${beginning}${action}(?:\\s+(?:com|para))?\\s+(?:(?:o|um|meu|este|esse)\\s+)?orcamento(?:\\s+(?:completo|em pdf|como esta))?$`).test(value)
    || quoteContext && new RegExp(`^${beginning}${action}$`).test(value);
}
function hasAssistantNavigation(text: string) {
  return /https?:\/\/|\bwww\.|\[[^\]\n]*(?:link|formul[aá]rio|or[cç]amento)[^\]\n]*\]|\[[^\]\n]+\]\s*\(|\b(?:url|link)_(?:do|para|aqui)|\blink\s+(?:abaixo|a seguir)|<a\b/i.test(text);
}
export function hasAssistantQuoteNavigation(text: string) {
  return hasAssistantNavigation(text) && /or[cç]amento|formul[aá]rio/i.test(text);
}
export function safeAssistantReply(text: string) {
  if (hasAssistantNavigation(text)) return hasAssistantQuoteNavigation(text) ? "Use o botão para continuar o orçamento." : "Posso orientar você pelos passos da loja.";
  if (/R\$|\b\d+[.,]?\d*\s*(?:reais|d[oó]lares)|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:ag[eê]ncia|conta banc[aá]ria|chave pix|cnpj)\s*[:\-]?\s*\d/i.test(text))
    return "Os valores e dados oficiais aparecem nos cartões da loja.";
  const clean = redactAssistantText(text).replace(/\n{3,}/g, "\n\n").trim();
  if (typeof Intl.Segmenter !== "function") return clean && clean.length <= 420 ? clean : "Vamos por partes. Qual informação você precisa primeiro?";
  const sentences: string[] = [];
  for (const { segment } of new Intl.Segmenter("pt-BR", { granularity: "sentence" }).segment(clean)) {
    if (sentences.length === 3 || [...sentences, segment.trim()].join(" ").length > 420) break;
    sentences.push(segment.trim());
  }
  return sentences.join(" ") || "Vamos por partes. Qual informação você precisa primeiro?";
}
