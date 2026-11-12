import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { StudioHero } from "@/components/commerce/StudioHero";
import { CommerceExperienceSettings } from "@/components/commerce/CommerceExperienceSettings";
import type { StoreProduct } from "@/components/commerce/StoreHome";
import { BannerCarousel, StoreHome } from "@/components/commerce/StoreHome";
import { defaultMockup } from "@/domain/commerce/artwork-options";
const settings = { name: "Ground Shop", description: "Sua arte em produtos personalizados.", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.com", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "" };
const products = ["Botton", "Espelho"].map((name, index) => ({ id: `product-${index}`, name, category: "Personalizados", imageUrl: `https://example.com/${index}.webp`, personalized: true, unitCents: 500, minQuantity: 1, offer: { originalUnitCents: 500, maxDiscountPercent: 0 } })) as StoreProduct[];
beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("optional studio experience", () => {
  it("accepts an explicit studio preset without changing legacy settings and rejects unsafe background URLs", () => {
    expect(storeSettingsSchema.parse(settings).experience).toBeUndefined();
    expect(storeSettingsSchema.parse({ ...settings, experience: { style: "studio", motion: true, backgroundUrl: "" } }).experience?.style).toBe("studio");
    expect(storeSettingsSchema.safeParse({ ...settings, experience: { style: "studio", motion: true, backgroundUrl: "javascript:alert(1)" } }).success).toBe(false);
  });
  it("shows the actual tenant brand and catalog images, preserves preview paths and allows product selection", () => {
    render(<StudioHero settings={settings} products={products} base="/commerce/ground-shop/preview" preview onOpenPreview={vi.fn()}/>);
    expect(screen.getByRole("heading", { level: 1, name: "Ground Shop" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Botton" })).toHaveAttribute("src", products[0].imageUrl);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar Espelho" }));
    expect(screen.getByRole("link", { name: "Personalizar Espelho" })).toHaveAttribute("href", "/commerce/ground-shop/preview/produto/product-1");
    expect(screen.queryByRole("link", { name: "Solicitar orçamento" })).not.toBeInTheDocument();
  });
  it("opens the demo explicitly without preloading the editor or inventing trust badges", () => {
    const open = vi.fn(); render(<StudioHero settings={settings} products={products} base="" onOpenPreview={open}/>);
    fireEvent.click(screen.getByRole("button", { name: "Ver como fica" })); expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Explorar produtos" })).toHaveAttribute("href", "/catalogo");
    expect(screen.queryByText(/Compra 100% segura|Clientes satisfeitos/)).not.toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
  });
  it("offers a preset, a binary motion toggle and upload, without activating other tenants", () => {
    const change = vi.fn(); render(<CommerceExperienceSettings onChange={change} onBusyChange={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "Clássico" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Estúdio" }));
    expect(change).toHaveBeenCalledWith({ style: "studio", motion: true, backgroundUrl: "" });
  });
  it("keeps campaigns and only one primary heading, without mounting a mockup before interaction", () => {
    const product = { ...products[0], geometry: { shape: "circle" }, artworkOptions: { mockup: defaultMockup() } } as StoreProduct;
    render(<StoreHome settings={{ ...settings, experience: { style: "studio", motion: true, backgroundUrl: "" }, bannerUrl: "https://example.com/banner.webp" }} products={[product]} base="/loja/test" slug="test"/>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Campanhas da loja" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Experimentar minha ideia" })).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.getByText("Aprovação antes da produção")).toBeInTheDocument();
  });
  it("stops animation for hidden pages, reduced motion and explicit pause, cleaning pointer writes", () => {
    const reduce = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const fine = { ...reduce, matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", (query: string) => query.includes("reduced") ? reduce : fine);
    const { unmount } = render(<StudioHero settings={settings} products={products} base=""/>);
    const hero = screen.getByRole("region", { name: "Estúdio Ground Shop" });
    expect(hero).toHaveAttribute("data-moving", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pausar movimento da vitrine" }));
    expect(hero).toHaveAttribute("data-moving", "false");
    fireEvent.click(screen.getByRole("button", { name: "Retomar movimento da vitrine" }));
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange")); expect(hero).toHaveAttribute("data-moving", "false");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange")); expect(hero).toHaveAttribute("data-moving", "true");
    reduce.matches = true;
    act(() => reduce.addEventListener.mock.calls.at(-1)?.[1]());
    expect(hero).toHaveAttribute("data-moving", "false");
    expect(hero.style.getPropertyValue("--studio-x")).toBe("");
    unmount(); expect(reduce.removeEventListener).toHaveBeenCalled();
  });
  it("does not restart a paused hero when a disconnected observer delivers an old callback", () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: !query.includes("reduced"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      observe() {} disconnect() {}
    });
    render(<StudioHero settings={settings} products={products} base=""/>);
    const hero = screen.getByRole("region", { name: "Estúdio Ground Shop" });
    fireEvent.click(screen.getByRole("button", { name: "Pausar movimento da vitrine" }));
    act(() => callbacks[0]([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(hero).toHaveAttribute("data-moving", "false");
  });
  it("keeps studio campaign banners static when the tenant disables motion", () => {
    vi.useFakeTimers();
    render(<BannerCarousel base="" settings={{ ...settings, experience: { style: "studio", motion: false, backgroundUrl: "" }, banners: ["Primeira", "Segunda"].map((title, index) => ({ id: String(index), imageUrl: "https://example.com/banner.webp", title, description: "", buttonLabel: "Ver", category: "" })) }}/>);
    act(() => vi.advanceTimersByTime(14000));
    expect(screen.getByRole("button", { name: "Mostrar banner 1" })).toHaveAttribute("aria-pressed", "true");
  });
});
