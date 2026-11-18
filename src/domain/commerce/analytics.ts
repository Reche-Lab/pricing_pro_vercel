import { z } from "zod";

export const analyticsSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  measurementId: z.string().trim().toUpperCase().regex(/^(?:G-[A-Z0-9]{4,20})?$/, "Informe o ID de medição no formato G-XXXXXXXXXX.").default(""),
  propertyId: z.string().trim().regex(/^\d{0,15}$/, "Informe o ID numérico da propriedade GA4.").default(""),
  debug: z.boolean().default(false),
  privacyReviewed: z.boolean().default(false),
  abandonmentHours: z.number().int().min(1).max(168).default(24),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.measurementId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["measurementId"], message: "Informe o ID de medição antes de ativar." });
  if (value.enabled && !value.privacyReviewed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["privacyReviewed"], message: "Revise a privacidade e desative a coleta automática do fluxo GA4 antes de ativar." });
});
export type AnalyticsSettings = z.infer<typeof analyticsSettingsSchema>;
export const defaultAnalyticsSettings = () => analyticsSettingsSchema.parse({});
export function publicAnalyticsSettings(raw: unknown): AnalyticsSettings {
  const result = analyticsSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : defaultAnalyticsSettings();
}

export type AnalyticsEvent = "page_view" | "view_item_list" | "select_item" | "view_item" | "add_to_cart" | "remove_from_cart" | "view_cart" | "begin_checkout" | "add_shipping_info" | "add_payment_info" | "order_created" | "purchase" | "login" | "quote_start" | "quote_review" | "quote_created" | "quote_pdf_download" | "quote_restored" | "catalog_search" | "shipping_quote" | "artwork_uploaded" | "artwork_approved";
export type AnalyticsItem = { item_id: string; item_name: string; price: number; quantity: number };
export type AnalyticsParameters = {
  currency?: "BRL"; value?: number; items?: AnalyticsItem[]; transaction_id?: string; shipping?: number;
  payment_type?: "pix" | "card" | "wallet" | "manual"; shipping_tier?: "delivery" | "pickup";
  customer_state?: "guest" | "identified" | "unknown"; journey?: "quote" | "purchase";
  method?: "email_code"; result_count?: number;
};
type PricedItem = { productId: string; name: string; quantity: number; totalCents: number; [key: string]: unknown };
export function analyticsCommercePayload(items: readonly PricedItem[]): AnalyticsParameters & { items: AnalyticsItem[] } {
  const valid = items.slice(0, 200).filter(item => Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.totalCents) && item.totalCents >= 0);
  return { currency: "BRL", value: valid.reduce((sum, item) => sum + item.totalCents, 0) / 100,
    items: valid.map(item => ({ item_id: item.productId.slice(0, 100), item_name: item.name.slice(0, 100), quantity: item.quantity, price: Number((item.totalCents / item.quantity / 100).toFixed(6)) })) };
}
export function safeAnalyticsParameters(raw: AnalyticsParameters): AnalyticsParameters {
  const out: AnalyticsParameters = {};
  if (raw.currency === "BRL") out.currency = "BRL";
  for (const key of ["value", "shipping"] as const) if (typeof raw[key] === "number" && Number.isFinite(raw[key]) && raw[key]! >= 0 && raw[key]! <= 10000000) out[key] = raw[key];
  if (raw.items) out.items = raw.items.slice(0, 200).filter(item => typeof item.item_id === "string" && typeof item.item_name === "string" && Number.isFinite(item.price) && item.price >= 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0).map(item => ({ item_id: item.item_id.slice(0, 100), item_name: item.item_name.slice(0, 100), price: item.price, quantity: item.quantity }));
  if (raw.transaction_id && /^[a-f0-9-]{36}$/i.test(raw.transaction_id)) out.transaction_id = raw.transaction_id;
  if (["pix", "card", "wallet", "manual"].includes(raw.payment_type ?? "")) out.payment_type = raw.payment_type;
  if (["delivery", "pickup"].includes(raw.shipping_tier ?? "")) out.shipping_tier = raw.shipping_tier;
  if (["guest", "identified", "unknown"].includes(raw.customer_state ?? "")) out.customer_state = raw.customer_state;
  if (["quote", "purchase"].includes(raw.journey ?? "")) out.journey = raw.journey;
  if (raw.method === "email_code") out.method = raw.method;
  if (Number.isSafeInteger(raw.result_count) && raw.result_count! >= 0) out.result_count = raw.result_count;
  return out;
}

export function analyticsPage(path: readonly string[]) {
  const routes: Record<string, [string, string, string]> = {
    home: ["home", "/", "Loja"], catalogo: ["catalog", "/catalogo", "Catálogo"], produto: ["product", /^[a-z0-9-]{1,100}$/.test(path[1] ?? "") ? `/produto/${path[1]}` : "/produto", "Produto"],
    carrinho: ["cart", "/carrinho", "Carrinho"], checkout: ["checkout", "/checkout", "Finalizar pedido"],
    orcamento: ["quote", "/orcamento", "Monte seu orçamento"], orcamentos: path[1] ? ["saved_quote", "/orcamentos/detalhe", "Seu orçamento"] : ["quotes", "/orcamentos", "Meus orçamentos"],
    pedidos: path[1] ? ["order", "/pedidos/detalhe", "Seu pedido"] : ["orders", "/pedidos", "Meus pedidos"],
    conta: ["account", "/conta", "Minha conta"], artes: ["artworks", "/artes", "Artes prontas"], campanhas: ["campaigns", "/campanhas", "Campanhas"],
  };
  const [page, cleanPath, title] = routes[path[0] || "home"] ?? ["institutional", "/informacoes", "Informações da loja"];
  return { page, path: cleanPath, title };
}

export function analyticsCartChanges(before: readonly { productId: string; quantity: number }[], after: readonly { productId: string; quantity: number }[]) {
  const totals = (lines: typeof before) => { const result = new Map<string, number>(); for (const line of lines) result.set(line.productId, (result.get(line.productId) ?? 0) + line.quantity); return result; };
  const old = totals(before), next = totals(after), added: { productId: string; quantity: number }[] = [], removed: typeof added = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const delta = (next.get(id) ?? 0) - (old.get(id) ?? 0);
    if (delta > 0) added.push({ productId: id, quantity: delta });
    if (delta < 0) removed.push({ productId: id, quantity: -delta });
  }
  return { added, removed };
}

export const analyticsReportQuerySchema = z.object({ days: z.enum(["7", "30", "90"]).default("30"), environment: z.enum(["production", "test", "all"]).default("production") }).strict();
export type AnalyticsReportQuery = z.infer<typeof analyticsReportQuerySchema>;
