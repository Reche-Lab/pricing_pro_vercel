import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceGoogleReviewsSettings } from "@/components/commerce/CommerceGoogleReviewsSettings";
import { StoreGoogleReviews } from "@/components/commerce/StoreGoogleReviews";
import { GoogleReviewsContent } from "@/components/commerce/GoogleReviewsContent";
import { storeRequest } from "@/components/commerce/store-http";
import { storeInstitutionalPage } from "@/domain/commerce/institutional";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
const settings = { configured: true, hasKey: true, placeId: "ChIJtest123456789", title: "Quem já comprou", dailyLimit: 50, usedToday: 0, revision: 1, enabled: false, tested: false, testedAt: null };
const data = { name: "Minha loja", rating: 4.7, total: 45, sourceUrl: "https://www.google.com/maps/place/test", reviews: [{ id: "r1", rating: 3, text: "Opinião pública", author: "Cliente", authorUrl: "https://www.google.com/maps/contrib/1", avatarUrl: "", sourceUrl: "https://www.google.com/maps/reviews/1", publishTime: "2026-11-13T12:00:00Z", relativeTime: "hoje" }] };
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Google reviews configuration UX", () => {
  it("keeps the key blank, requires testing and explicit company confirmation", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_path, method, body) => method === "POST" ? (body as { action: string }).action === "test" ? { settings: { ...settings, tested: true }, preview: data, message: "Teste OK" } : { settings: { ...settings, enabled: true, tested: true }, message: "Ativada" } : { settings });
    render(<CommerceGoogleReviewsSettings/>);
    expect(await screen.findByLabelText("Chave da Places API (New)")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Ativar avaliações na loja" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Testar conexão e visualizar" }));
    const activate = await screen.findByRole("button", { name: "Ativar avaliações na loja" }); expect(activate).toBeDisabled();
    expect(screen.getByText("Minha loja")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que o perfil/ })); fireEvent.click(activate);
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/google-reviews", "POST", { action: "toggle", revision: 1, enabled: true, confirmPlace: true }));
  });
  it("blocks unsaved tests and surfaces failures inline", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_path, method) => { if (method === "PUT") throw new Error("Salve uma chave válida."); return { settings }; });
    render(<CommerceGoogleReviewsSettings/>);
    fireEvent.change(await screen.findByLabelText("Place ID da empresa"), { target: { value: "ChIJnewplace123" } });
    expect(screen.getByRole("button", { name: "Testar conexão e visualizar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Salve uma chave válida.");
  });
});
describe("public reviews", () => {
  it("makes no Google content call if the tenant has not activated the section", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ enabled: false })); vi.stubGlobal("fetch", request);
    render(<StoreGoogleReviews slug="tenant-a" base="/loja/tenant-a" preview={false}/>);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1)); expect(document.querySelector("[data-google-reviews]")).toBeNull();
  });
  it("loads content only once the section is visible and uses the private preview path", async () => {
    let callback: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe() {} disconnect() {} });
    const request = vi.fn().mockImplementation(async (_url, options) => Response.json(options.method === "POST" ? { data } : { enabled: true, title: "Avaliações", sourceUrl: data.sourceUrl })); vi.stubGlobal("fetch", request);
    render(<StoreGoogleReviews slug="tenant-a" base="/commerce/tenant-a/preview" preview/>);
    await screen.findByRole("status"); expect(request).toHaveBeenCalledTimes(1);
    callback!([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    await screen.findByText("Opinião pública"); expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][0]).toBe("/api/commerce/tenant-a/preview/google-reviews");
    expect(screen.getByRole("link", { name: "Sobre as avaliações e sua privacidade" })).toHaveAttribute("href", "/commerce/tenant-a/preview/avaliacoes-google");
  });
  it("offers the real Google Maps link if a live query fails without retry loops", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const request = vi.fn().mockImplementation(async (_url, options) => options.method === "POST" ? Response.json({}, { status: 429 }) : Response.json({ enabled: true, title: "Avaliações", sourceUrl: data.sourceUrl })); vi.stubGlobal("fetch", request);
    render(<StoreGoogleReviews slug="tenant-a" base="/loja/tenant-a" preview={false}/>);
    expect(await screen.findByRole("link", { name: "Ver avaliações no Google Maps" })).toHaveAttribute("href", data.sourceUrl); expect(request).toHaveBeenCalledTimes(2);
  });
  it("preserves the source, author, date and relevance disclosure without SEO rating markup", () => {
    render(<GoogleReviewsContent data={data} title="Avaliações" base="/loja/tenant-a"/>);
    expect(screen.getByRole("link", { name: "Cliente" })).toHaveAttribute("href", data.reviews[0].authorUrl);
    expect(screen.getByRole("link", { name: "Ver avaliação no Google Maps" })).toHaveAttribute("href", data.reviews[0].sourceUrl);
    expect(screen.getByText(/selecionadas pelo Google por relevância/)).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(storeInstitutionalPage("any-tenant", ["avaliacoes-google"])?.sections.length).toBe(3);
  });
});
