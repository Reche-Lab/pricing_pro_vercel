import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceBlogSettings } from "@/components/commerce/CommerceBlogSettings";
import { storeRequest } from "@/components/commerce/store-http";
import { defaultBlogSettings, type BlogAdminData } from "@/domain/commerce/blog-settings";
import { groundShopArticles } from "@/content/ground-shop-blog";

vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
vi.mock("@/components/commerce/CommerceImageUpload", () => ({ CommerceImageUpload: ({ onChange, label }: { onChange: (url: string) => void; label: string }) => <button type="button" onClick={() => onChange("https://media.test/imagem-nova.webp")}>Enviar {label}</button> }));
const data: BlogAdminData = { settings: defaultBlogSettings("ground-shop", "Ground Shop"), revision: 0, migrationRequired: false, posts: groundShopArticles.slice(0, 2).map(article => ({ article, status: "published", revision: 0 })) };
const busy = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.mocked(storeRequest).mockImplementation(async (_url, method) => ({ ...structuredClone(data), ...(method === "PUT" ? { message: "Artigo salvo e publicado." } : {}) })); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function mount() { render(<CommerceBlogSettings slug="ground-shop" onBusyChange={busy}/>); await screen.findByRole("heading", { name: "Blog da loja" }); }
async function editFirst() { await mount(); fireEvent.click(screen.getByRole("button", { name: `Editar ${groundShopArticles[0].title}` })); return screen.getByRole("dialog"); }
describe("blog configuration UX", () => {
  it("lists compact articles, filters by title and keeps preview inside the tenant", async () => {
    await mount(); expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "summit" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Prévia do blog" })).toHaveAttribute("href", "/commerce/ground-shop/preview/blog");
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar publicação" }), { target: { value: "draft" } });
    expect(screen.getByText(/Nenhum artigo encontrado/)).toBeInTheDocument();
  });
  it("edits article text and uploads a cover while preserving slug, sections and publication state", async () => {
    const modal = await editFirst();
    expect(within(modal).getByLabelText(/Endereço do artigo/)).toHaveAttribute("readonly");
    fireEvent.change(within(modal).getByLabelText("Título", { exact: true }), { target: { value: "Um título revisado" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Enviar Capa do artigo" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Salvar e publicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [, method, body] = vi.mocked(storeRequest).mock.calls.find(call => call[1] === "PUT")!;
    expect(method).toBe("PUT"); expect(body).toMatchObject({ action: "article", revision: 0, slug: groundShopArticles[0].slug, status: "published", content: { title: "Um título revisado", image: "https://media.test/imagem-nova.webp", sections: groundShopArticles[0].sections.map(section => ({ id: section.id, title: section.title, paragraphs: section.paragraphs })) } });
  });
  it("shows save errors inside the editor, retaining all entered text", async () => {
    const modal = await editFirst();
    vi.mocked(storeRequest).mockRejectedValueOnce(new Error("O conteúdo mudou em outra aba. Recarregue."));
    fireEvent.change(within(modal).getByLabelText("Título", { exact: true }), { target: { value: "Minha revisão" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Salvar e publicar" }));
    expect(await within(modal).findByRole("alert")).toHaveTextContent("outra aba");
    expect(within(modal).getByLabelText("Título", { exact: true })).toHaveValue("Minha revisão");
  });
  it("creates a minimal draft without forcing publication and asks before discarding edits", async () => {
    await mount(); fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Título", { exact: true }), { target: { value: "Nova inspiração" } });
    expect(within(modal).getByLabelText(/Endereço do artigo/)).toHaveValue("nova-inspiracao");
    fireEvent.click(within(modal).getByRole("button", { name: "Cancelar" }));
    expect(within(modal).getByRole("alert")).toHaveTextContent("não salvas");
    fireEvent.click(within(modal).getByRole("button", { name: "Continuar editando" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(vi.mocked(storeRequest).mock.calls.find(call => call[1] === "PUT")?.[2]).toMatchObject({ status: "draft", content: { title: "Nova inspiração" } });
  });
  it("keeps new sections expanded while typing and preserves paragraph breaks", async () => {
    await mount(); fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Título", { exact: true }), { target: { value: "Artigo novo" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Adicionar seção" }));
    fireEvent.change(within(modal).getByLabelText("Título da seção"), { target: { value: "Primeira seção" } });
    expect(within(modal).getByLabelText("Título da seção").closest("details")).toHaveAttribute("open");
    fireEvent.change(within(modal).getByRole("textbox", { name: /^Texto/ }), { target: { value: "Primeiro parágrafo.\n\nSegundo parágrafo." } });
    fireEvent.click(within(modal).getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(vi.mocked(storeRequest).mock.calls.find(call => call[1] === "PUT")?.[2]).toMatchObject({ content: { sections: [{ paragraphs: ["Primeiro parágrafo.", "Segundo parágrafo."] }] } });
  });
  it("displays the migration requirement instead of pretending edits can be saved", async () => {
    vi.mocked(storeRequest).mockResolvedValueOnce({ ...data, migrationRequired: true });
    await mount(); expect(screen.getByRole("alert")).toHaveTextContent("0086_commerce_blog.sql");
    expect(screen.getByRole("button", { name: "Novo artigo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Editar ${groundShopArticles[0].title}` })).toBeDisabled();
  });
});
