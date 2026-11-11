import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Informe uma data válida no formato AAAA-MM-DD.");
export const productionSettingsSchema = z.object({
  minimumDays: z.number().int().min(1).max(120),
  unitsPerDay: z.number().int().min(1).max(1000000),
  holidays: z.array(calendarDate).max(366),
}).strict();
export type ProductionSettings = z.infer<typeof productionSettingsSchema>;
export const defaultProductionSettings = (): ProductionSettings => ({ minimumDays: 3, unitsPerDay: 100, holidays: [] });
export function resolveProductionSettings(input?: unknown): ProductionSettings {
  const result = productionSettingsSchema.safeParse(input);
  return result.success ? result.data : defaultProductionSettings();
}
export function productionDays(quantity: number, settings?: ProductionSettings) {
  const rule = resolveProductionSettings(settings);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid production quantity.");
  return Math.max(rule.minimumDays, Math.ceil(quantity / rule.unitsPerDay));
}
export function saoPauloDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function addBusinessDays(start: string, days: number, holidays: string[] = []) {
  calendarDate.parse(start);
  if (!Number.isSafeInteger(days) || days < 0 || days > 2000000) throw new Error("Invalid business day count.");
  const date = new Date(`${start}T12:00:00Z`), excluded = new Set(holidays);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay()) && !excluded.has(date.toISOString().slice(0, 10))) remaining--;
  }
  return date.toISOString().slice(0, 10);
}
export function deliveryEstimate(quantity: number, transportDays: number | null, settings?: ProductionSettings, start = saoPauloDate()) {
  const rule = resolveProductionSettings(settings), production = productionDays(quantity, rule);
  const transport = transportDays !== null && Number.isSafeInteger(transportDays) && transportDays >= 0 && transportDays <= 365 ? transportDays : null;
  const productionReadyDate = addBusinessDays(start, production, rule.holidays);
  // Holidays here are production closures; carrier transit excludes weekends only.
  return { productionDays: production, transportDays: transport, productionReadyDate,
    deliveryDate: transport === null ? null : addBusinessDays(productionReadyDate, transport), estimatedFrom: start };
}
export type DeliveryEstimate = ReturnType<typeof deliveryEstimate>;
export function transportDaysFromQuote(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  for (const key of ["transitDays", "deliveryTime", "custom_delivery_time", "delivery_time"]) {
    if (value[key] === null || value[key] === undefined || value[key] === "") continue;
    const days = Number(value[key]);
    if (Number.isSafeInteger(days) && days >= 0 && days <= 365) return days;
  }
  return null;
}
export function formatDeliveryDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
