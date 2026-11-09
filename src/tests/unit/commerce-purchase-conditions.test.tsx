import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { purchaseConditionsPage, purchaseConditionsText, PURCHASE_CONDITIONS_VERSION } from "@/domain/commerce/purchase-conditions";
import { StoreInstitutionalPage } from "@/components/commerce/StoreInstitutionalPage";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { storePageMetadata, institutionalStructuredData } from "@/services/commerce/store-seo";

const settings = storeSettingsSchema.parse({ name: "Ground Shop", description: "Loja", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "11999990000", pickupEnabled: true, pickupAddress: "Rua da loja, 10", deliveryEnabled: true, deliveryCents: 1500, deliveryDescription: "Entrega combinada", terms: "Produção em prazo combinado.\n\nConfirme a data do evento com a equipe." });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("clear purchase conditions", () => {
  it("separates responsibilities and preserves the store-specific conditions without waiving consumer rights", () => {
    const page = purchaseConditionsPage("ground-shop", settings);
    expect(new Set(page.sections.map(section => section.id)).size).toBe(page.sections.length);
    const text = purchaseConditionsText("ground-shop", settings);
    for (const term of ["Pricing Pro", "comprador", "7 dias", "30 dias", "90 dias", "não elimina", "publicidade", settings.terms, settings.contactEmail, PURCHASE_CONDITIONS_VERSION]) expect(text).toContain(term);
    expect(text).not.toMatch(/não aceitamos devolu|nenhuma responsabilidade|foro exclusivo/i);
    expect(page.sections.some(section => section.id === "condicoes-da-loja")).toBe(true);
  });
  it("never displays Ground Shop identity or another store's instructions for a different tenant", () => {
    const text = purchaseConditionsText("other", { ...settings, name: "Outra loja", terms: "Condição deste tenant" });
    expect(text).toContain("Outra loja");
    expect(text).toContain("Condição deste tenant");
    expect(text).not.toContain("38.265.820");
    expect(text).not.toContain("DANILO FRANK");
    expect(text).not.toContain("Produção em prazo combinado.");
  });
  it.each([false, true])("renders organized, escaped and accessible content with scoped links (preview: %s)", preview => {
    const page = purchaseConditionsPage("ground-shop", { ...settings, terms: '<script>alert("xss")</script>\nTexto da loja' });
    const html = renderToStaticMarkup(<StoreInstitutionalPage slug="ground-shop" page={page} settings={settings} preview={preview}/>);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe("Condições de compra");
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.getElementById("condicoes-da-loja")?.textContent).toContain('<script>alert("xss")</script>');
    for (const section of page.sections) {
      expect(document.getElementById(section.id)).not.toBeNull();
      expect(document.querySelector(`a[href='#${section.id}']`)).not.toBeNull();
    }
    expect(html).toContain(preview ? "/commerce/ground-shop/preview/politica-de-troca" : "/loja/ground-shop/politica-de-troca");
  });
  it("offers browser printing without creating a payment or submitting a form", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<StoreInstitutionalPage slug="ground-shop" page={purchaseConditionsPage("ground-shop", settings)} settings={settings}/>);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir ou salvar em PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });
  it("provides tenant-specific metadata and structured data only for exact published condition paths", () => {
    const meta = storePageMetadata("other", ["condicoes"], settings, true, "https://panel.test");
    expect(meta.title).toEqual({ absolute: "Condições de compra | Ground Shop" });
    expect(meta.robots).toMatchObject({ index: true });
    expect(storePageMetadata("other", ["condicoes", "extra"], settings, true).robots).toMatchObject({ index: false });
    expect(storePageMetadata("other", ["condicoes"], settings, false).robots).toMatchObject({ index: false });
    expect(institutionalStructuredData("other", "condicoes", settings)?.["@graph"][1]).toMatchObject({ name: "Condições de compra | Ground Shop", dateModified: "2026-11-09" });
  });
});
