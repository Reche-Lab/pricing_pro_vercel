import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreBuyerOrderDetail } from "@/components/commerce/StoreBuyerOrderDetail";
import { StoreAnalyticsConsent, StoreAnalyticsProvider } from "@/components/commerce/StoreAnalytics";
import { defaultAnalyticsSettings } from "@/domain/commerce/analytics";
import { buyerOrder } from "../fixtures/commerce-buyer-order";
vi.mock("@/components/commerce/CommerceOrderArtworks", () => ({ CommerceOrderArtworks: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
const config = { ...defaultAnalyticsSettings(), enabled: true, privacyReviewed: true, measurementId: "G-ABC1234567" };
const metrics = window as unknown as { dataLayer?: IArguments[]; gtag?: (...args: unknown[]) => void };
const purchases = () => (metrics.dataLayer ?? []).map(value => Array.from(value)).filter(value => value[0] === "event" && value[1] === "purchase");
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); document.querySelectorAll("script[data-commerce-ga4]").forEach(script => script.remove()); delete metrics.dataLayer; delete metrics.gtag; });
function fixture(order = buyerOrder) {
  return <StoreAnalyticsProvider slug="shop" settings={config} disabled={false} base=""><StoreBuyerOrderDetail order={order} api="/api/store/shop" base="" instructions="" busy={false} onRefresh={async () => {}} products={[]}/><StoreAnalyticsConsent/></StoreAnalyticsProvider>;
}
describe("confirmed purchase measurement", () => {
  it("waits for consent, uses the actual paid amount and shipping separately, and does not repeat after refresh", () => {
    const view = render(fixture()); expect(purchases()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar métricas" }));
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0][2]).toMatchObject({ transaction_id: buyerOrder.id, value: 150, shipping: 12, currency: "BRL" });
    expect(JSON.stringify(purchases())).not.toContain(buyerOrder.billing!.email);
    view.rerender(fixture({ ...buyerOrder })); expect(purchases()).toHaveLength(1);
  });
  it.each([
    { ...buyerOrder, payment_status: "pending", provider: "manual" as const },
    { ...buyerOrder, payment_status: "refunded" },
    { ...buyerOrder, payment_environment: "test" as const },
  ])("does not report a pending/refunded/test order as a purchase", order => {
    render(fixture(order)); fireEvent.click(screen.getByRole("button", { name: "Aceitar métricas" })); expect(purchases()).toHaveLength(0);
  });
});
