import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreQuantityPricing, StoreProductQuestions } from "@/components/commerce/StoreQuantityPricing";
import { CommerceMerchantProduct } from "@/components/commerce/CommerceMerchantProduct";
import { CommerceSearchSettings } from "@/components/commerce/CommerceSearchSettings";
import { discoveryProduct as product, discoverySettings as settings } from "../fixtures/commerce-discovery";
import type { CommerceMerchant } from "@/domain/commerce/merchant";
afterEach(cleanup);
describe("public quantity table", () => {
  it("renders the entire factual table and questions into initial HTML without fetching or login", () => {
    const html = renderToStaticMarkup(<><StoreQuantityPricing product={product} disabled={false} onSelect={() => {}}/><StoreProductQuestions product={product} settings={settings}/></>);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(product.quantityPricing!.rows.length);
    expect(doc.querySelector("caption")?.textContent).toContain(product.name);
    expect(doc.querySelector("tbody tr[data-best=true]")?.textContent).toContain("60%");
    expect(doc.querySelector("details[open]")).toBeNull();
    expect(doc.body.textContent).toContain("com uma mesma arte");
    expect(doc.body.textContent).toContain("quantidade de cada arte");
    expect(doc.body.textContent).toContain("Compra mínima");
  });
  it("offers accessible quantity shortcuts that do not trigger cart mutations", () => {
    const select = vi.fn(); render(<StoreQuantityPricing product={product} disabled={false} onSelect={select}/>);
    fireEvent.click(screen.getByText("Ver tabela de preços"));
    fireEvent.click(screen.getByRole("button", { name: "Simular 100 unidades com uma arte" }));
    expect(select).toHaveBeenCalledWith(100);
  });
  it("honors disabled upload/purchase states and hides incomplete legacy price summaries", () => {
    const select = vi.fn(); const { rerender } = render(<StoreQuantityPricing product={product} disabled onSelect={select}/>);
    fireEvent.click(screen.getByText("Ver tabela de preços"));
    expect(screen.getByRole("button", { name: "Simular 100 unidades com uma arte" })).toBeDisabled();
    rerender(<StoreQuantityPricing product={{ ...product, quantityPricing: undefined }} disabled={false} onSelect={select}/>);
    expect(screen.queryByLabelText("Preços por quantidade")).not.toBeInTheDocument();
  });
});
describe("human-readable search administration", () => {
  it("starts opted out, explicitly confirms identifiers and reports missing required data", () => {
    function Fixture() { const [value, setValue] = useState<CommerceMerchant>(); return <CommerceMerchantProduct value={value} onChange={setValue}/>; }
    render(<Fixture/>);
    fireEvent.click(screen.getByText("Catálogo Google"));
    const enable = screen.getByRole("checkbox", { name: /Incluir no catálogo Google/ });
    expect(enable).not.toBeChecked(); fireEvent.click(enable);
    expect(screen.getByRole("status")).toHaveTextContent("Informe GTIN");
    fireEvent.click(screen.getByRole("checkbox", { name: /não possui GTIN/ }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("GTIN")).not.toBeInTheDocument();
  });
  it("shows store-scoped feed, sitemap and tools without tokens or automatic paid campaigns", () => {
    const catalog = vi.fn(); render(<CommerceSearchSettings publicUrl="https://groundshop.com.br" published selectedProducts={3} onCatalog={catalog}/>);
    expect(screen.getByRole("link", { name: "Abrir Catálogo Merchant Center" })).toHaveAttribute("href", "https://groundshop.com.br/produtos.xml");
    expect(screen.getByRole("link", { name: "Abrir Mapa da loja" })).toHaveAttribute("href", "https://groundshop.com.br/sitemap.xml");
    fireEvent.click(screen.getByRole("button", { name: "Selecionar produtos para o Google" })); expect(catalog).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Etapas de ativação")); expect(screen.getByText(/nem cria anúncios pagos/)).toBeInTheDocument();
  });
});
