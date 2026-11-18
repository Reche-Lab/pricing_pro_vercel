import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStoreAnalytics } from "@/components/commerce/analytics-browser";
import { StoreAnalyticsConsent, StoreAnalyticsProvider, useStoreAnalytics } from "@/components/commerce/StoreAnalytics";
import { analyticsSettingsSchema } from "@/domain/commerce/analytics";
const config = analyticsSettingsSchema.parse({ enabled: true, privacyReviewed: true, measurementId: "G-ABC1234567" });
const win = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: IArguments[]; [key: string]: unknown };
const commands = () => (win.dataLayer ?? []).map(command => Array.from(command));
const events = () => commands().filter(command => command[0] === "event");
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear();
  document.querySelectorAll("script[data-commerce-ga4]").forEach(script => script.remove());
  delete win.gtag; delete win.dataLayer; delete win["ga-disable-G-ABC1234567"];
  history.replaceState({}, "", "/");
  for (const name of document.cookie.split(";").map(part => part.split("=")[0].trim())) document.cookie = `${name}=;Max-Age=0;Path=/`;
  vi.restoreAllMocks();
});
describe("consent-gated store measurement", () => {
  it("keeps only recognized acquisition categories and the referrer origin, never free-form campaigns", () => {
    history.replaceState({}, "", "/?utm_source=google&utm_medium=cpc&utm_campaign=NomeDoCliente&email=secret@test&gclid=private");
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://www.google.com/search?q=private-name&email=secret@test");
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted"); tracker.track("page_view");
    expect(events().at(-1)?.[2]).toMatchObject({ page_referrer: "https://www.google.com", page_location: expect.stringContaining("utm_source=google&utm_medium=cpc") });
    expect(JSON.stringify(commands())).not.toMatch(/NomeDoCliente|secret|private|gclid|utm_campaign/);
  });
  it("does not load a tag, create metric storage, or send any command before consent or after refusal", () => {
    const tracker = createStoreAnalytics("shop", config, "/loja/shop"); tracker.start(); tracker.track("view_cart");
    expect(document.querySelector("script[data-commerce-ga4]")).toBeNull(); expect(win.dataLayer).toBeUndefined(); expect(localStorage.length).toBe(0);
    tracker.choose("denied"); expect(tracker.track("begin_checkout")).toBe(false);
    expect(win.dataLayer).toBeUndefined();
    expect(createStoreAnalytics("shop", config, "/loja/shop").getConsent()).toBe("denied");
  });
  it("loads exactly one tag after acceptance with advertising denied and automatic page views disabled", () => {
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted");
    tracker.track("page_view"); tracker.track("view_item");
    expect(document.querySelectorAll("script[data-commerce-ga4]")).toHaveLength(1);
    expect(commands().filter(command => command[0] === "config")).toHaveLength(1);
    expect(commands()).toContainEqual(["consent", "default", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" })]);
    expect(commands()).toContainEqual(["consent", "update", expect.objectContaining({ analytics_storage: "granted", ad_user_data: "denied", ad_personalization: "denied" })]);
    expect(commands()).toContainEqual(["config", config.measurementId, expect.objectContaining({ send_page_view: false, allow_google_signals: false, cookie_prefix: "commerce_shop" })]);
  });
  it("exports only whitelisted parameters and sanitized locations, never document URLs/contact data", () => {
    const tracker = createStoreAnalytics("shop", config, "/loja/shop"); tracker.setPage(["pedidos", "private-order-id?email=secret@test"]); tracker.choose("granted");
    tracker.track("purchase", { currency: "BRL", value: 12, email: "secret@test", document: "CPF", artworkName: "Nome do cliente", page_location: "https://evil.test/?token=secret" } as never);
    const payload = events().at(-1)![2];
    expect(payload).toMatchObject({ currency: "BRL", value: 12, send_to: config.measurementId, page_title: "Seu pedido" });
    expect(JSON.stringify(commands())).not.toMatch(/private-order|secret|Nome do cliente|CPF|evil\.test/);
  });
  it("deduplicates paid transactions through rerenders and page remounts, scoped to this store", () => {
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted");
    expect(tracker.once("purchase:1", "purchase")).toBe(true); expect(tracker.once("purchase:1", "purchase")).toBe(false);
    tracker.dispose(); const restored = createStoreAnalytics("shop", config, ""); restored.start();
    expect(restored.once("purchase:1", "purchase")).toBe(false);
    expect(restored.track("page_view")).toBe(true); expect(win["ga-disable-G-ABC1234567"]).toBe(false);
    const other = createStoreAnalytics("other", config, ""); expect(other.getConsent()).toBeNull();
    expect(other.once("purchase:1", "purchase")).toBe(false);
    expect(events().filter(event => event[1] === "purchase")).toHaveLength(1);
  });
  it("revokes/re-enables tracking, removes only own metric cookies, and preserves the cart", () => {
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted");
    document.cookie = "commerce_shop_ga=1;Path=/"; document.cookie = "commerce_other_ga=2;Path=/"; document.cookie = "buyer_cart=essential;Path=/";
    tracker.choose("denied"); expect(document.cookie).not.toContain("commerce_shop_ga="); expect(document.cookie).toContain("buyer_cart=essential"); expect(document.cookie).toContain("commerce_other_ga=2");
    expect(tracker.track("view_cart")).toBe(false);
    tracker.choose("granted"); expect(win["ga-disable-G-ABC1234567"]).toBe(false); expect(tracker.track("view_cart")).toBe(true);
  });
  it("respects browser privacy signals even after an attempted grant", () => {
    vi.spyOn(window, "navigator", "get").mockReturnValue(Object.defineProperty(Object.create(navigator), "doNotTrack", { value: "1" }));
    const tracker = createStoreAnalytics("shop", config, ""); expect(tracker.choose("granted")).toBe("denied"); expect(tracker.track("page_view")).toBe(false);
    expect(document.querySelector("script[data-commerce-ga4]")).toBeNull();
  });
  it("never lets a broken third-party tag fail a store action or reserve a successful-event key", () => {
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted");
    win.gtag = () => { throw new Error("Blocked tag"); };
    expect(() => tracker.track("add_to_cart")).not.toThrow(); expect(tracker.once("add:1", "add_to_cart")).toBe(false);
    win.gtag = vi.fn(); expect(tracker.once("add:1", "add_to_cart")).toBe(true);
  });
  it("disables events in commerce test mode and after unmount", () => {
    const tracker = createStoreAnalytics("shop", config, ""); tracker.choose("granted"); tracker.setTestMode(true);
    expect(tracker.track("purchase")).toBe(false); tracker.setTestMode(false); expect(tracker.track("page_view")).toBe(true);
    tracker.dispose(); expect(tracker.track("purchase")).toBe(false);
  });
});
function Trigger() { const analytics = useStoreAnalytics(); return <button onClick={() => analytics.track("view_cart")}>Medir carrinho</button>; }
describe("public consent controls", () => {
  it("offers equal refusal/acceptance and allows editing the choice in the footer", () => {
    render(<StoreAnalyticsProvider slug="shop" settings={config} base="" disabled={false}><Trigger/><StoreAnalyticsConsent/></StoreAnalyticsProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Medir carrinho" })); expect(events()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Somente necessárias" })); expect(screen.queryByLabelText("Preferências de privacidade")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Privacidade e cookies" })); fireEvent.click(screen.getByRole("button", { name: "Aceitar métricas" }));
    fireEvent.click(screen.getByRole("button", { name: "Medir carrinho" })); expect(events().at(-1)?.[1]).toBe("view_cart");
  });
  it("never initializes analytics in the private preview", () => {
    render(<StoreAnalyticsProvider slug="shop" settings={config} base="" disabled><Trigger/><StoreAnalyticsConsent/></StoreAnalyticsProvider>);
    expect(screen.queryByRole("button", { name: "Privacidade e cookies" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Medir carrinho" })); expect(win.dataLayer).toBeUndefined();
  });
});
