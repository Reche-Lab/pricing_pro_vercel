import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, statSync } from "node:fs";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { blogCard, blogMinutes, blogPath, filterBlogCards, storeBlogEnabled } from "@/domain/commerce/blog";
import { StoreBlog, StoreBlogTeaser } from "@/components/commerce/blog/StoreBlog";
import { BlogIndex } from "@/components/commerce/blog/BlogIndex";
import { SaveArticle, CreativePause, ArticleTools } from "@/components/commerce/blog/BlogInteractions";
import { storeBlogMetadata, storeBlogStructuredData } from "@/services/commerce/blog-seo";
import { serializeStructuredData } from "@/services/commerce/store-seo";
import { commerceSitemapEntries, commerceSitemapXml } from "@/services/commerce/sitemap";
import { commerceDomainRoute } from "@/domain/commerce/domains";
import { discoverySettings as settings } from "../fixtures/commerce-discovery";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Ground Shop editorial catalog", () => {
  it("has unique useful articles, section anchors and real lightweight images", () => {
    expect(groundShopArticles).toHaveLength(8);
    expect(new Set(groundShopArticles.map(a => a.slug)).size).toBe(8);
    for (const article of groundShopArticles) {
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(new Set(article.sections.map(s => s.id)).size).toBe(article.sections.length);
      expect(article.sections.flatMap(s => s.paragraphs).join(" ").length).toBeGreaterThan(1500);
      expect(Number.isNaN(Date.parse(article.updated))).toBe(false);
      expect(Date.parse(article.updated)).toBeGreaterThanOrEqual(Date.parse(article.published));
      expect(blogMinutes(article)).toBeGreaterThanOrEqual(2);
      expect(existsSync(`public${article.image}`)).toBe(true);
      expect(statSync(`public${article.image}`).size).toBeLessThan(250_000);
    }
    expect(storeBlogEnabled("ground-shop")).toBe(true);
    for (const slug of ["another-store", "groundshop", "__proto__", "GROUND-SHOP"]) expect(storeBlogEnabled(slug)).toBe(false);
  });
  it("finds accented words and multiple search terms without requiring exact titles", () => {
    const cards = groundShopArticles.map(blogCard);
    expect(filterBlogCards(cards, "imas geladeira", "").map(a => a.slug)).toEqual([groundShopArticles[4].slug]);
    expect(filterBlogCards(cards, "", "Empresas e eventos")).toHaveLength(2);
    expect(filterBlogCards(cards, "casamento", "Arte e medidas")).toHaveLength(0);
  });
  it.each(groundShopArticles)("renders $slug in server HTML without waiting for JavaScript", article => {
    const html = renderToStaticMarkup(<StoreBlog base="" article={article} products={[]}/>);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe(article.title);
    for (const section of article.sections) {
      expect(document.getElementById(section.id)?.textContent).toContain(section.paragraphs[0]);
      expect(document.querySelector(`a[href='#${section.id}']`)).not.toBeNull();
    }
    expect(html).toContain("Composição ilustrativa");
    expect(html).not.toMatch(/aggregateRating|reviewCount|cinco estrelas/);
  });
  it("renders every index link before hydration and preserves preview navigation", () => {
    const base = "/commerce/ground-shop/preview";
    const index = renderToStaticMarkup(<StoreBlog base={base} products={[]} preview/>);
    for (const article of groundShopArticles) expect(index).toContain(blogPath(base, article.slug));
    const html = renderToStaticMarkup(<StoreBlog base={base} article={groundShopArticles[0]} products={[]} preview/>);
    expect(html).not.toContain(`${base}/orcamento`);
    expect(html).toContain(`${base}/catalogo`);
    expect(renderToStaticMarkup(<StoreBlogTeaser base=""/>)).toContain('href="/blog"');
  });
});
describe("blog discovery and tenant boundaries", () => {
  it("uses the authorized store domain and complete article/social metadata", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"groundshop.com.br":"ground-shop"}');
    const article = groundShopArticles[0];
    const metadata = storeBlogMetadata("ground-shop", settings, true, article, "https://platform.test");
    expect(metadata.alternates?.canonical).toBe(`https://groundshop.com.br/blog/${article.slug}`);
    expect(metadata.openGraph).toMatchObject({ type: "article", publishedTime: article.published, images: [{ url: `https://platform.test${article.image}`, width: 1440, height: 960 }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.robots).toMatchObject({ index: true });
    expect(storeBlogMetadata("ground-shop", settings, false).robots).toMatchObject({ index: false });
    const graph = storeBlogStructuredData("ground-shop", settings, article, "https://platform.test")["@graph"];
    expect(graph[2]).toMatchObject({ "@type": "BlogPosting", dateModified: article.updated, author: { name: "Equipe Ground Shop" }, url: `https://groundshop.com.br/blog/${article.slug}` });
    expect(JSON.stringify(graph)).not.toMatch(/ratingValue|reviewCount/);
    const unsafe = storeBlogStructuredData("ground-shop", { ...settings, name: "</script><script>" }, article);
    expect(serializeStructuredData(unsafe)).not.toContain("<");
  });
  it("adds only this tenant's blog and stable dates to the XML sitemap", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"groundshop.com.br":"ground-shop"}');
    const entries = commerceSitemapEntries("ground-shop", [], "https://platform.test");
    expect(entries.filter(e => e.url.includes("/blog"))).toHaveLength(9);
    const doc = new DOMParser().parseFromString(commerceSitemapXml(entries), "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(commerceSitemapEntries("other", [], "https://platform.test").some(e => e.url.includes("blog"))).toBe(false);
    expect(commerceDomainRoute("groundshop.com.br", groundShopArticles[0].image)).toEqual({ slug: "ground-shop", type: "next" });
    expect(commerceDomainRoute("groundshop.com.br", "/blog")).toMatchObject({ type: "rewrite", path: "/loja/ground-shop/blog" });
  });
});
describe("lightweight blog interactions", () => {
  it("filters by theme, searches and clears empty results", () => {
    render(<BlogIndex articles={groundShopArticles.map(blogCard)} base=""/>);
    fireEvent.click(screen.getByRole("button", { name: "Empresas e eventos" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 histórias");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inexistente" } });
    expect(screen.getByRole("status")).toHaveTextContent("0 histórias");
    fireEvent.click(screen.getByRole("button", { name: "Ver todas as histórias" }));
    expect(screen.getByRole("status")).toHaveTextContent("8 histórias");
  });
  it("persists a saved reading and handles blocked storage without crashing", () => {
    const { unmount } = render(<SaveArticle slug="artigo"/>);
    fireEvent.click(screen.getByRole("button")); expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"); unmount();
    render(<SaveArticle slug="artigo"/>); expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(screen.getByRole("button")); expect(screen.getByRole("status")).toHaveTextContent("não permitiu");
  });
  it("changes ideas and shows a humanized copy failure instead of an alert", async () => {
    render(<><CreativePause/><ArticleTools/></>);
    const before = screen.getByText(/Um botton para cada pergunta/).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Experimentar outra ideia" }));
    expect(screen.queryByText(before!)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "festa" } });
    expect(screen.getByText(/Um espelho com a flor/)).toBeInTheDocument();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Copie o endereço");
  });
});
