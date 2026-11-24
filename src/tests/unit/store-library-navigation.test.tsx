import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreCategoryNavigation } from "@/components/commerce/StoreCategoryNavigation";
import { storeRequest } from "@/components/commerce/store-http";
import type { LibraryResult } from "@/domain/commerce/library";

vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${cents / 100}` }));
const categoryId = "11111111-1111-4111-8111-111111111111", childId = "22222222-2222-4222-8222-222222222222", artId = "33333333-3333-4333-8333-333333333333";
const data: LibraryResult = {
  enabled: true, total: 1, page: 1, pageSize: 24,
  categories: [
    { id: categoryId, name: "Conscientização", slug: "conscientizacao", parent_id: null, active: true, sort_order: 0, revision: 1 },
    { id: childId, name: "Outubro Rosa", slug: "outubro-rosa", parent_id: categoryId, active: true, sort_order: 1, revision: 1 },
  ],
  campaigns: [{ id: "campaign", name: "Outubro Rosa", slug: "outubro-rosa", description: "Conscientização", cover_url: "/campanha.webp", status: "published", featured: true, starts_at: null, ends_at: null, sort_order: 0, revision: 1, artwork_count: 1 }],
  artworks: [{ id: artId, title: "Laço rosa", description: "", tags: [], category_id: childId, status: "published", editable: true, version: "v1", revision: 1, file_name: "laco.webp", width: 600, height: 600, campaign_ids: ["campaign"], product_ids: ["product"] }],
};
const props = { products: [], base: "/loja/ground-shop", preview: false, view: "home", libraryEnabled: true, libraryApi: "/api/store/ground-shop/library" };
beforeEach(() => { vi.mocked(storeRequest).mockReset().mockResolvedValue(data); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("library dropdown navigation", () => {
  it("keeps campaigns in the main menu and removes the ready-artwork trigger", async () => {
    render(<StoreCategoryNavigation {...props}/>);
    expect(storeRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Artes prontas" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    const panel = await screen.findByRole("region", { name: "Campanhas da loja" });
    expect(await within(panel).findByRole("link", { name: /Outubro Rosa/ })).toHaveAttribute("href", props.base + "/campanhas/outubro-rosa");
    expect(storeRequest).toHaveBeenCalledWith(props.libraryApi);
    fireEvent.click(screen.getByRole("button", { name: "Fechar categorias" }));
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    expect(storeRequest).toHaveBeenCalledTimes(1);
  });
  it("preserves preview authentication paths and custom-domain links", async () => {
    const { rerender } = render(<StoreCategoryNavigation {...props} base="/commerce/ground-shop/preview" preview libraryApi="/api/commerce/ground-shop/preview/library"/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    expect(await screen.findByRole("link", { name: /Outubro Rosa/ })).toHaveAttribute("href", "/commerce/ground-shop/preview/campanhas/outubro-rosa");
    expect(storeRequest).toHaveBeenCalledWith("/api/commerce/ground-shop/preview/library");
    rerender(<StoreCategoryNavigation {...props} base="" navigationKey="custom-domain"/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    await screen.findByRole("link", { name: /Outubro Rosa/ });
    expect(screen.getByRole("link", { name: "Ver todas as campanhas" })).toHaveAttribute("href", "/campanhas");
  });
  it("keeps a humanized error inside the dropdown and retries explicitly", async () => {
    vi.mocked(storeRequest).mockRejectedValueOnce(new Error("Biblioteca indisponível no momento."));
    render(<StoreCategoryNavigation {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Biblioteca indisponível");
    expect(screen.getByRole("link", { name: "Ver todas as campanhas" })).toHaveAttribute("href", props.base + "/campanhas");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: /Outubro Rosa.*arte/ })).toBeInTheDocument();
    expect(storeRequest).toHaveBeenCalledTimes(2);
  });
  it("does not display unpublished or expired campaigns to buyers", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...data,
      campaigns: [data.campaigns[0], { ...data.campaigns[0], id: "draft", name: "Em rascunho", status: "draft" }, { ...data.campaigns[0], id: "expired", name: "Encerrada", ends_at: "2000-01-01T00:00:00Z" }],
    });
    render(<StoreCategoryNavigation {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    await screen.findByRole("link", { name: /Outubro Rosa/ });
    expect(screen.queryByText("Em rascunho")).not.toBeInTheDocument();
    expect(screen.queryByText("Encerrada")).not.toBeInTheDocument();
  });
  it("does not carry a previous tenant's campaigns into another tenant", async () => {
    const { rerender } = render(<StoreCategoryNavigation {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" })); await screen.findByRole("link", { name: /Outubro Rosa/ });
    let resolve!: (value: unknown) => void;
    vi.mocked(storeRequest).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    rerender(<StoreCategoryNavigation {...props} base="/loja/other" libraryApi="/api/store/other/library" navigationKey="other"/>);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    expect(screen.queryByText("Outubro Rosa")).not.toBeInTheDocument();
    await act(async () => { resolve({ ...data, categories: [], campaigns: [], artworks: [], total: 0 }); });
    await waitFor(() => expect(screen.getByText("Novas campanhas estarão disponíveis em breve.")).toBeInTheDocument());
  });
  it("does not request the library when the feature is disabled", () => {
    render(<StoreCategoryNavigation {...props} libraryEnabled={false}/>);
    expect(screen.queryByRole("button", { name: "Campanhas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Artes prontas" })).not.toBeInTheDocument();
    expect(storeRequest).not.toHaveBeenCalled();
  });
});
