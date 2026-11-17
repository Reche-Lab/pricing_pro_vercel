import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storefront } from "@/components/commerce/Storefront";
import { storeRequest } from "@/components/commerce/store-http";
import { discoveryProduct as product, discoverySettings as settings } from "../fixtures/commerce-discovery";
const search = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({ useSearchParams: () => search, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/commerce/store-http", async original => ({ ...await original<typeof import("@/components/commerce/store-http")>(), storeRequest: vi.fn() }));
afterEach(() => { search.delete("quantidade"); vi.clearAllMocks(); });
describe("public product initial HTML", () => {
  it.each(["", "/loja/shop"])("contains price conditions, quantity table and FAQ with JavaScript disabled under %s", base => {
    search.set("quantidade", "100");
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<Storefront slug="shop" settings={settings} products={[product]} path={["produto", product.slug!]} basePath={base} paused={false}/>), "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe(product.name);
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(product.quantityPricing!.rows.length);
    expect(doc.body.textContent).toContain("2,00"); expect(doc.body.textContent).toContain("60%"); expect(doc.body.textContent).toContain("uma mesma arte");
    expect(doc.body.textContent).toContain("50,00"); expect(doc.body.textContent).toContain("prazo de produção");
    expect([...doc.querySelectorAll("input")].some(input => input.value === "100")).toBe(true);
    expect([...doc.querySelectorAll("strong")].some(element => element.textContent?.includes("300,00"))).toBe(true);
    expect(doc.body.textContent).not.toContain("Calculando…");
    expect([...doc.querySelectorAll("button")].find(button => button.textContent?.includes("Adicionar ao carrinho"))?.disabled).toBe(true);
    expect(storeRequest).not.toHaveBeenCalled();
    expect(doc.querySelector('a[href$="/catalogo"]')).not.toBeNull();
  });
});
