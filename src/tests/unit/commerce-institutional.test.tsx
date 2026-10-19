import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { storeInstitutionalPage, storeInstitutionalPages } from "@/domain/commerce/institutional";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { StoreInstitutionalPage } from "@/components/commerce/StoreInstitutionalPage";
import { institutionalStructuredData, serializeStructuredData, storePageMetadata } from "@/services/commerce/store-seo";
import { commerceSitemapEntries, commerceSitemapXml } from "@/services/commerce/sitemap";

const settings = storeSettingsSchema.parse({ name: "Ground Shop", description: "Criações personalizadas", logoUrl: "https://example.test/logo.png", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições da compra" });
const origin = "https://shop.example.test";
describe("Ground Shop institutional content and SEO", () => {
  it("provides exactly five pages only for the intended tenant and exact paths", () => {
    expect(storeInstitutionalPages("ground-shop")).toHaveLength(5);
    for (const slug of ["other-tenant", "groundshop", "GROUND-SHOP"]) expect(storeInstitutionalPages(slug)).toEqual([]);
    expect(storeInstitutionalPage("ground-shop", ["quem-somos", "extra"])).toBeUndefined();
    expect(storeInstitutionalPage("ground-shop", ["__proto__"])).toBeUndefined();
  });
  it.each(storeInstitutionalPages("ground-shop"))("renders $title as readable HTML with working section anchors and preview-local links", page => {
    const html = renderToStaticMarkup(<StoreInstitutionalPage slug="ground-shop" page={page} settings={settings} preview />);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe(page.title);
    expect(document.querySelectorAll("details")).toHaveLength(page.questions.length + 1);
    for (const section of page.sections) {
      expect(document.getElementById(section.id)?.textContent).toContain(section.paragraphs[0]);
      expect(document.querySelector(`a[href='#${section.id}']`)).not.toBeNull();
    }
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")) {
      expect(anchor.getAttribute("href")).toMatch(/^\/commerce\/ground-shop\/preview/);
    }
  });
  it("uses unique canonical URLs, page titles and complete social metadata instead of platform defaults", () => {
    const titles = new Set();
    for (const page of storeInstitutionalPages("ground-shop")) {
      const meta = storePageMetadata("ground-shop", [page.slug], settings, true, origin);
      expect(meta.title).toEqual({ absolute: `${page.title} | Ground Shop` });
      expect(meta.alternates?.canonical).toBe(`${origin}/loja/ground-shop/${page.slug}`);
      expect(meta.description).toBe(page.description);
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.openGraph).toMatchObject({ siteName: "Ground Shop", url: `${origin}/loja/ground-shop/${page.slug}`, images: [{ url: settings.logoUrl, alt: "Ground Shop" }] });
      expect(meta.twitter).toMatchObject({ title: `${page.title} | Ground Shop`, description: page.description });
      titles.add(meta.description);
    }
    expect(titles.size).toBe(5);
    expect(storePageMetadata("ground-shop", ["quem-somos"], settings, false, origin).robots).toMatchObject({ index: false });
    expect(storePageMetadata("other", ["quem-somos"], settings, true, origin).robots).toMatchObject({ index: false });
    expect(storePageMetadata("ground-shop", ["checkout"], settings, true, origin).robots).toMatchObject({ index: false });
  });
  it("uses valid AboutPage/WebPage and visible breadcrumbs, with safe JSON serialization", () => {
    const data = institutionalStructuredData("ground-shop", "quem-somos", settings, origin)!;
    expect(data["@graph"][1]).toMatchObject({ "@type": "AboutPage", inLanguage: "pt-BR" });
    expect(data["@graph"][2]).toMatchObject({ "@type": "BreadcrumbList", itemListElement: [
      { position: 1, item: `${origin}/loja/ground-shop` }, { position: 2, item: `${origin}/loja/ground-shop/quem-somos` }
    ] });
    const malicious = institutionalStructuredData("ground-shop", "termos-de-uso", { ...settings, name: "</script><img onerror=alert(1)>" }, origin);
    expect(serializeStructuredData(malicious)).not.toContain("<");
    expect(JSON.parse(serializeStructuredData(malicious))["@graph"][1]["@type"]).toBe("WebPage");
    expect(institutionalStructuredData("other", "quem-somos", settings, origin)).toBeNull();
  });
  it("generates a parseable sitemap with all pages and products but no private flows", () => {
    const entries = commerceSitemapEntries("ground-shop", ["published-product"], origin);
    expect(entries).toHaveLength(8);
    expect(entries.some(item => /preview|checkout|carrinho|conta|pedidos/.test(item.url))).toBe(false);
    const document = new DOMParser().parseFromString(commerceSitemapXml(entries), "application/xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelectorAll("loc")).toHaveLength(8);
    expect(commerceSitemapEntries("other", [], origin)).toHaveLength(2);
    const escaped = commerceSitemapXml([{ url: `${origin}/?q=<test>&a=2` }]);
    expect(new DOMParser().parseFromString(escaped, "application/xml").querySelector("loc")?.textContent).toBe(`${origin}/?q=<test>&a=2`);
  });
});
