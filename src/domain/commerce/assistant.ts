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
  | { kind: "proposal"; actionId: string; items: { name: string; quantity: number; artworkName: string; unitCents: number; totalCents: number }[]; totalCents: number; expiresAt: string }
  | { kind: "cart"; items: { name: string; quantity: number; artworkName: string; unitCents: number; totalCents: number }[]; totalCents: number }
  | { kind: "shipping"; options: (StoreShippingOption & { estimate: DeliveryEstimate })[]; warnings: string[] }
  | { kind: "company"; company: AssistantSettings["company"]; documents: AssistantDocument[] }
  | { kind: "orders"; orders: { id: string; totalCents: number; payment: string; fulfillment: string; createdAt: string }[] }
  | { kind: "quotes"; quotes: { id: string; totalCents: number; createdAt: string }[] }
  | { kind: "guide"; topic: "artwork" | "shopping" | "policies" }
  | { kind: "handoff"; summary: string }
  | { kind: "login" }
  | { kind: "quote_saved"; quoteId: string; totalCents: number };
export type AssistantMessage = { id: string; role: "user" | "assistant"; text: string; cards: AssistantCard[] };
export const assistantProposalSchema = z.object({ items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50000), artworks: z.number().int().min(1).max(10).default(1), artworkName: z.string().trim().max(80).default("") }).strict()).min(1).max(10) }).strict();
export type AssistantProposalInput = z.infer<typeof assistantProposalSchema>;
export const assistantRequestSchema = z.discriminatedUnion("action", [
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
export function safeAssistantReply(text: string) {
  if (/R\$|\b\d+[.,]?\d*\s*(?:reais|d[oó]lares)|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:ag[eê]ncia|conta banc[aá]ria|chave pix|cnpj)\s*[:\-]?\s*\d/i.test(text))
    return "Confira os dados oficiais e os valores atualizados nos cartões abaixo. Posso ajudar a comparar as opções e continuar seu atendimento.";
  return redactAssistantText(text).replace(/https?:\/\/\S+/gi, "(consulte os atalhos oficiais abaixo)").slice(0, 2400);
}
