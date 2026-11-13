import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreFooter } from "@/components/commerce/StoreFooter";
import { PlatformSignature } from "@/components/branding/PlatformSignature";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import type { StoreProduct } from "@/components/commerce/StoreHome";
const settings = storeSettingsSchema.parse({ name: "Loja do tenant", description: "", logoUrl: "https://example.test/logo.png", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "+55 (12) 99999-1234", pickupEnabled: true, pickupAddress: "Rua da loja, 10", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "", experience: { style: "studio", motion: true, backgroundUrl: "" } });
const products = [{ id: "one", name: "Botton", imageUrl: "/one.png", personalized: true, geometry: { shape: "circle" }, artworkOptions: { mockup: {} } }, { id: "two", name: "Espelho", imageUrl: "/two.png", personalized: false }] as StoreProduct[];
const links = [{ slug: "quem-somos", title: "Quem somos" }, { slug: "politica-de-privacidade", title: "Privacidade" }];
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("store footer", () => {
  it("uses tenant branding, real catalog images and eligible creation links", () => {
    render(<StoreFooter settings={settings} products={products} base="/loja/tenant-a" libraryEnabled institutionalLinks={links}/>);
    expect(screen.getByRole("img", { name: "Logo Loja do tenant" })).toHaveAttribute("src", settings.logoUrl);
    expect(screen.getByRole("link", { name: "Ver Botton" })).toHaveAttribute("href", "/loja/tenant-a/produto/one");
    expect(screen.getByRole("link", { name: "Crie sua arte aqui" })).toHaveAttribute("href", "/loja/tenant-a?estudio=1");
    expect(screen.getByRole("link", { name: "Campanhas" })).toHaveAttribute("href", "/loja/tenant-a/campanhas");
    expect(screen.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/loja/tenant-a/politica-de-privacidade");
    expect(screen.queryByText(/100% seguro|Compra garantida/)).not.toBeInTheDocument();
  });
  it("does not advertise unavailable studio/library, contact, pickup or payment services", () => {
    render(<StoreFooter settings={{ ...settings, logoUrl: "", contactPhone: "", pickupEnabled: false, experience: undefined }} products={[]} base=""/>);
    expect(screen.queryByRole("link", { name: "Crie sua arte aqui" })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Campanhas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Rua da loja, 10")).not.toBeInTheDocument(); expect(screen.queryByText(/Mercado Pago/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Condições de compra" })).toHaveAttribute("href", "/condicoes");
  });
  it("preserves private preview paths and does not offer real account/order actions", () => {
    render(<StoreFooter settings={settings} products={products} base="/commerce/a/preview" preview libraryEnabled institutionalLinks={links}/>);
    expect(screen.getByRole("link", { name: "Ver Botton" })).toHaveAttribute("href", "/commerce/a/preview/produto/one");
    expect(screen.getByRole("link", { name: "Condições de compra" })).toHaveAttribute("href", "/commerce/a/preview/condicoes");
    expect(screen.queryByRole("link", { name: "Acompanhar pedido" })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Meus orçamentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Solicitar orçamento" })).not.toBeInTheDocument();
  });
  it("shows real contact links and enabled payment information without inventing individual methods", () => {
    const { rerender } = render(<StoreFooter settings={settings} products={products} base="" payments={{ mp_enabled: true, payment_environment: "production" }}/>);
    expect(screen.getByRole("link", { name: /Conversar pelo WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("https://wa.me/5512999991234"));
    expect(screen.getByRole("link", { name: settings.contactEmail })).toHaveAttribute("href", `mailto:${settings.contactEmail}`);
    expect(screen.getByText("Pagamentos via Mercado Pago")).toBeInTheDocument(); expect(screen.queryByText("Pix")).not.toBeInTheDocument();
    rerender(<StoreFooter settings={settings} products={products} base="" payments={{ mp_enabled: true, payment_environment: "test" }}/>);
    expect(screen.queryByText("Pagamentos via Mercado Pago")).not.toBeInTheDocument(); expect(screen.getByText("Ambiente de testes · sem cobrança real")).toBeInTheDocument();
  });
  it("keeps navigation compact on mobile while leaving customer support visible", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<StoreFooter settings={settings} products={products} base="" institutionalLinks={links}/>);
    const summary = screen.getByText("Informações da loja", { selector: "summary" }); const group = summary.closest("details")!;
    expect(group).not.toHaveAttribute("open"); expect(screen.getByRole("link", { name: settings.contactEmail })).toBeVisible();
    act(() => { group.open = true; fireEvent(group, new Event("toggle")); });
    expect(within(group).getByRole("link", { name: "Quem somos" })).toBeVisible();
  });
  it("keeps checkout quiet while retaining support, terms and platform credits", () => {
    render(<StoreFooter settings={settings} products={products} base="" view="checkout"/>);
    expect(screen.queryByRole("region", { name: "Continue sua criação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver Botton" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: settings.contactEmail })).toBeVisible();
    expect(screen.getByRole("link", { name: "Condições de compra" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rechelab" })).toBeInTheDocument();
  });
  it("falls back from an unavailable logo and scrolls to top with reduced motion respected", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const scroll = vi.fn(); vi.stubGlobal("scrollTo", scroll);
    render(<StoreFooter settings={settings} products={products} base=""/>);
    fireEvent.error(screen.getByRole("img", { name: "Logo Loja do tenant" })); expect(screen.queryByRole("img", { name: "Logo Loja do tenant" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao topo" })); expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
describe("platform and creator attribution", () => {
  it("clearly separates Liaflow from rechelab and uses the requested external destinations safely", () => {
    render(<PlatformSignature/>);
    const platform = screen.getByRole("link", { name: /Liaflow/ }), creator = screen.getByRole("link", { name: /rechelab/ });
    expect(platform).toHaveAttribute("href", "https://liaflow-calcula.vercel.app/"); expect(creator).toHaveAttribute("href", "https://reche-lab-portfolio.vercel.app/");
    for (const link of [platform, creator]) { expect(link).toHaveAttribute("target", "_blank"); expect(link).toHaveAttribute("rel", expect.stringContaining("noopener")); }
    expect(screen.getByText("Criação")).toBeInTheDocument(); expect(screen.getByText("Plataforma")).toBeInTheDocument();
  });
});
