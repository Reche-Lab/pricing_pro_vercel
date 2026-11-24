import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioHero } from "@/components/commerce/StudioHero";
import { STUDIO_HEARTBEAT_PERIOD_MS } from "@/components/commerce/use-studio-motion";
import type { StoreSettings } from "@/domain/commerce/schemas";
import type { StoreProduct } from "@/components/commerce/StoreHome";

const settings = { name: "Ground Shop" } as StoreSettings;
const rotationPeriod = STUDIO_HEARTBEAT_PERIOD_MS * 2;
const products = Array.from({ length: 5 }, (_, index) => ({
  id: `product-${index}`, name: `Produto ${index + 1}`, category: "Personalizados",
  imageUrl: `/product-${index}.png`, personalized: true, unitCents: 500, minQuantity: 1,
  offer: { originalUnitCents: 500, maxDiscountPercent: 30 + index },
})) as StoreProduct[];
let callbacks: Map<number, FrameRequestCallback>, serial: number, time: number;

function advance(milliseconds: number) {
  for (let remaining = milliseconds; remaining > 0; remaining -= 40) {
    act(() => {
      time += Math.min(remaining, 40);
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach(callback => callback(time));
    });
  }
}
function rotate() {
  advance(40); // The first frame establishes the clock without advancing its phase.
  advance(rotationPeriod);
}

beforeEach(() => {
  callbacks = new Map(); serial = 0; time = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("studio product carousel", () => {
  it("replaces unit prices with the maximum quantity discount for the selected product", () => {
    render(<StudioHero settings={settings} products={products} base="/loja/ground-shop"/>);
    expect(screen.getByText("Descontos de até 30%")).toBeInTheDocument();
    expect(screen.queryByText(/R\$|\/ un\./)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar Produto 2" }));
    expect(screen.getByText("Descontos de até 31%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Personalizar Produto 2" })).toHaveAttribute("href", "/loja/ground-shop/produto/product-1");
  });

  it("uses the published quantity pricing, without inventing discounts for products without one", () => {
    const product = { ...products[0], quantityPricing: { bestPrice: { discountPercent: 47.5 } } } as StoreProduct;
    const { rerender } = render(<StudioHero settings={settings} products={[product]} base=""/>);
    expect(screen.getByText("Descontos de até 47,5%")).toBeInTheDocument();
    rerender(<StudioHero settings={settings} products={[{ ...products[0], offer: { ...products[0].offer, maxDiscountPercent: 0 } }]} base=""/>);
    expect(screen.queryByText(/Descontos de até/)).not.toBeInTheDocument();
    expect(screen.getByText("Personalize do seu jeito")).toBeInTheDocument();
  });

  it("changes only after two full cycles, visits all products and loops to the first", () => {
    render(<StudioHero settings={settings} products={products} base=""/>);
    advance(40); advance(STUDIO_HEARTBEAT_PERIOD_MS);
    expect(screen.getByRole("img", { name: "Produto 1" })).toBeInTheDocument();
    advance(STUDIO_HEARTBEAT_PERIOD_MS - 40);
    expect(screen.getByRole("img", { name: "Produto 1" })).toBeInTheDocument();
    advance(40);
    expect(screen.getByRole("button", { name: "Mostrar Produto 2" })).toHaveAttribute("aria-pressed", "true");
    for (let index = 2; index <= products.length; index++) {
      rotate();
      expect(screen.getByRole("img", { name: `Produto ${index % products.length + 1}` })).toBeInTheDocument();
    }
  });

  it("gives a manually selected product two full cycles and freezes both the carousel and pulse on pause", () => {
    render(<StudioHero settings={settings} products={products} base=""/>);
    advance(40); advance(rotationPeriod - 80);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar Produto 4" }));
    advance(40); advance(rotationPeriod - 40);
    expect(screen.getByRole("img", { name: "Produto 4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pausar movimento da vitrine" }));
    advance(10000); expect(callbacks.size).toBe(0);
    expect(screen.getByRole("img", { name: "Produto 4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retomar movimento da vitrine" }));
    advance(40); advance(40);
    expect(screen.getByRole("img", { name: "Produto 5" })).toBeInTheDocument();
  });

  it("does not catch up after a hidden tab and leaves manual navigation available with reduced motion", () => {
    const { unmount } = render(<StudioHero settings={settings} products={products} base=""/>);
    advance(40); advance(rotationPeriod - 40);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange")); advance(10000);
    expect(screen.getByRole("img", { name: "Produto 1" })).toBeInTheDocument();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange")); advance(40); advance(40);
    expect(screen.getByRole("img", { name: "Produto 2" })).toBeInTheDocument();
    unmount(); expect(callbacks.size).toBe(0);
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<StudioHero settings={settings} products={products} base=""/>);
    advance(10000); expect(callbacks.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar Produto 5" }));
    expect(screen.getByRole("img", { name: "Produto 5" })).toBeInTheDocument();
  });

  it("handles an empty catalog, a single product and tenant-disabled motion", () => {
    const { rerender } = render(<StudioHero settings={settings} products={[]} base=""/>);
    expect(screen.queryByRole("link", { name: /Personalizar/ })).not.toBeInTheDocument();
    rerender(<StudioHero settings={settings} products={[products[0]]} base=""/>);
    rotate(); expect(screen.getByRole("img", { name: "Produto 1" })).toBeInTheDocument();
    rerender(<StudioHero settings={{ ...settings, experience: { style: "studio", motion: false, backgroundUrl: "" } }} products={products} base=""/>);
    advance(10000); expect(callbacks.size).toBe(0);
    expect(screen.getByRole("img", { name: "Produto 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar Produto 3" }));
    expect(screen.getByRole("img", { name: "Produto 3" })).toBeInTheDocument();
  });
});
