import { defaultAnalyticsSettings } from "@/domain/commerce/analytics";
import type { CommerceAnalyticsReport } from "@/repositories/commerce-analytics";

export const analyticsFixtureSettings = defaultAnalyticsSettings();
export const analyticsFixtureReport: CommerceAnalyticsReport = {
  days: 30, environment: "production", abandonmentHours: 24,
  summary: { orders: 15, paidOrders: 9, pendingOrders: 4, refundedOrders: 2, paidCents: 123450, pendingCents: 45000, quotes: 12, quoteCents: 250000, carts: 17, guestCarts: 10, identifiedCarts: 7, guestQuoteDrafts: 3, identifiedQuoteDrafts: 2, abandonedCarts: 5, legacyQuotes: 2 },
  daily: [{ day: "2026-11-16", orders: 5, paidCents: 45000, quotes: 3 }, { day: "2026-11-17", orders: 8, paidCents: 70000, quotes: 7 }, { day: "2026-11-18", orders: 2, paidCents: 8450, quotes: 2 }],
  products: [{ name: "Botton personalizado - 3,5 cm", quantity: 450, totalCents: 98000 }, { name: "Ímã personalizado - 4,5 cm", quantity: 100, totalCents: 21450 }],
};
