import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BannerCarousel } from "@/components/commerce/StoreHome";
import {
  useStoreTheme,
  accentForeground,
} from "@/components/commerce/use-store-theme";
import {
  storeSettingsSchema,
  type StoreSettings,
} from "@/domain/commerce/schemas";
const settings: StoreSettings = {
  name: "Ground Shop",
  description: "Sua arte em produtos",
  logoUrl: "",
  bannerUrl: "",
  accent: "#047857",
  contactEmail: "test@example.test",
  contactPhone: "",
  pickupEnabled: false,
  pickupAddress: "",
  deliveryEnabled: false,
  deliveryCents: 0,
  deliveryDescription: "",
  terms: "",
  banners: [
    {
      id: "172eea1e-8962-44dc-8d42-c20fa89b9f4d",
      imageUrl: "https://example.test/one.webp",
      title: "Primeira coleção",
      description: "",
      buttonLabel: "Ver coleção",
      category: "Bottons",
    },
    {
      id: "10ff4745-1ee8-46ec-916b-898b31a0bc22",
      imageUrl: "https://example.test/two.webp",
      title: "Segunda coleção",
      description: "",
      buttonLabel: "Ver coleção",
      category: "",
    },
  ],
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi
      .fn()
      .mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("storefront merchandising", () => {
  it("moves banners and preserves preview navigation without autoplay for reduced motion", () => {
    render(
      <BannerCarousel
        settings={settings}
        base="/commerce/ground-shop/preview"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reproduzir banners" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver coleção" })).toHaveAttribute(
      "href",
      "/commerce/ground-shop/preview/catalogo?categoria=Bottons",
    );
    fireEvent.click(screen.getByRole("button", { name: "Próximo banner" }));
    expect(
      screen.getByRole("heading", { name: "Segunda coleção" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mostrar banner 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Banner anterior" }));
    expect(
      screen.getByRole("heading", { name: "Primeira coleção" }),
    ).toBeInTheDocument();
  });
  it("accepts legacy settings while rejecting unsafe banners and excessive slides", () => {
    expect(
      storeSettingsSchema.safeParse({
        ...settings,
        theme: undefined,
        banners: undefined,
      }).success,
    ).toBe(true);
    expect(
      storeSettingsSchema.safeParse({
        ...settings,
        banners: [{ ...settings.banners![0], imageUrl: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      storeSettingsSchema.safeParse({
        ...settings,
        banners: Array(6).fill(settings.banners![0]),
      }).success,
    ).toBe(false);
  });
  it("supports image-only banners without duplicate overlay text", () => {
    render(
      <BannerCarousel
        settings={{
          ...settings,
          banners: settings.banners!.map((banner) => ({
            ...banner,
            showText: false,
          })),
        }}
        base="/loja/ground-shop"
      />,
    );
    expect(
      screen.queryByRole("heading", { name: "Primeira coleção" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver coleção" })).toHaveAttribute(
      "href",
      "/loja/ground-shop/catalogo?categoria=Bottons",
    );
    expect(
      screen.getByRole("heading", { name: "Ground Shop" }),
    ).toBeInTheDocument();
  });
  it("preserves the legacy cover and supports touch navigation", () => {
    const { rerender } = render(
      <BannerCarousel
        settings={{
          ...settings,
          banners: undefined,
          bannerUrl: "https://example.test/cover.webp",
        }}
        base="/loja/ground-shop"
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/cover.webp",
    );
    expect(
      screen.queryByRole("button", { name: "Próximo banner" }),
    ).not.toBeInTheDocument();
    rerender(<BannerCarousel settings={settings} base="/loja/ground-shop" />);
    const carousel = screen.getByRole("region", { name: "Destaques da loja" });
    fireEvent.touchStart(carousel, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(carousel, {
      changedTouches: [{ clientX: 100, clientY: 105 }],
    });
    expect(
      screen.getByRole("button", { name: "Mostrar banner 2" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("persists theme independently per store and chooses readable button text", () => {
    function Theme() {
      const { theme, toggle } = useStoreTheme("ground-shop", "light");
      return <button onClick={toggle}>{theme}</button>;
    }
    render(<Theme />);
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    expect(localStorage.getItem("commerce-theme:ground-shop")).toBe("dark");
    expect(localStorage.getItem("commerce-theme:another-shop")).toBeNull();
    expect(accentForeground("#ffffff")).toBe("#111111");
    expect(accentForeground("#000000")).toBe("#ffffff");
  });
});
