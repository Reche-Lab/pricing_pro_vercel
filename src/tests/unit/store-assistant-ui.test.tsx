import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreAssistantPanel } from "@/components/commerce/StoreAssistantPanel";
import { StoreAssistantCards } from "@/components/commerce/StoreAssistantCards";
import { StoreAssistantLauncher } from "@/components/commerce/StoreAssistantLauncher";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import type { AssistantCard } from "@/domain/commerce/assistant";
import { deliveryEstimate } from "@/domain/shipping/production-lead-time";
const ids = { conv: "00000000-0000-4000-8000-000000000001", action: "00000000-0000-4000-8000-000000000002", quote: "00000000-0000-4000-8000-000000000003" };
const config = { enabled: true, name: "Ajuda Ground Shop", welcome: "Olá, como posso ajudar?", retentionDays: 30, quotes: true, orders: true };
const settings = storeSettingsSchema.parse({ name: "Loja teste", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: true, pickupAddress: "Rua de teste", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições para testes" });
const proposal: AssistantCard = { kind: "proposal", actionId: ids.action, items: [{ name: "Botton", quantity: 100, artworkName: "Arte A", unitCents: 100, totalCents: 10000 }], totalCents: 10000, expiresAt: "2099-01-01T00:00:00Z" };
const fetcher = vi.fn();
const resume = vi.fn();
vi.mock("@/components/commerce/StoreCheckout", () => ({ StoreCheckout: ({ onSubmit }: { onSubmit: (input: unknown) => Promise<void> }) => <button onClick={() => void onSubmit({ expectedTotalCents: 10000, billing: { document: "52998224725" } })}>Confirmar orçamento de teste</button> }));
beforeEach(() => {
  fetcher.mockReset(); resume.mockReset().mockImplementation(async () => Response.json({ conversation: null, messages: [], customer: false, confirmedActionIds: [] }));
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => init?.body && JSON.parse(String(init.body)).action === "resume" ? resume(url, init) : fetcher(url, init));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function() { this.removeAttribute("open"); } });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = () => ({ config, api: "/api/store/test", base: "/loja/test", settings, onCartChanged: vi.fn(async () => {}), onClose: vi.fn() });
function response(messages: unknown[] = []) { return Response.json({ conversation: { id: ids.conv }, messages, customer: false }); }
async function consent() { fireEvent.click(await screen.findByRole("button", { name: "Entendi, iniciar atendimento" })); }
describe("store assistant customer UX", () => {
  it("resumes an existing conversation and its confirmed proposals without requesting consent or writing again", async () => {
    resume.mockResolvedValueOnce(Response.json({ conversation: { id: ids.conv }, messages: [{ id: "old", role: "assistant", text: "Vamos continuar seu orçamento", cards: [proposal] }], customer: true, confirmedActionIds: [ids.action] }));
    render(<StoreAssistantPanel {...props()}/>);
    await screen.findByText("Vamos continuar seu orçamento");
    expect(screen.queryByRole("button", { name: "Entendi, iniciar atendimento" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proposta adicionada" })).toBeDisabled();
    expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.parse(resume.mock.calls[0][1].body)).toEqual({ action: "resume" });
  });
  it("lets a product selection tell the assistant the exact product name without adding to the cart", async () => {
    resume.mockResolvedValueOnce(response([{ id: "products", role: "assistant", text: "Escolha o tamanho", cards: [{ kind: "products", products: [{ id: ids.quote, name: "Botton - 3,5 cm", category: "Bottons", imageUrl: "", unitCents: 500, minQuantity: 1 }] }] }]));
    fetcher.mockResolvedValueOnce(Response.json({ messages: [{ id: "next", role: "assistant", text: "Quantas unidades você precisa?", cards: [] }] }));
    const p = props(); render(<StoreAssistantPanel {...p}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Quero este produto: Botton - 3,5 cm" }));
    await screen.findByText("Quantas unidades você precisa?");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ action: "message", conversationId: ids.conv, text: 'Tenho interesse no produto "Botton - 3,5 cm".' });
    expect(p.onCartChanged).not.toHaveBeenCalled();
  });
  it("recovers history after visiting a product and mounting the chat again without browser storage", async () => {
    const history = [{ id: "products", role: "assistant", text: "Seu orçamento de bottons", cards: [{ kind: "products", products: [{ id: ids.quote, name: "Botton", category: "Bottons", imageUrl: "", unitCents: 500, minQuantity: 1 }] }] }];
    resume.mockImplementation(async () => response(history));
    const p = props(), first = render(<StoreAssistantPanel {...p}/>);
    const link = await screen.findByRole("link", { name: "Conhecer produto" });
    link.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(p.onClose).toHaveBeenCalledTimes(1); first.unmount();
    render(<StoreAssistantPanel {...props()}/>);
    await screen.findByText("Seu orçamento de bottons");
    expect(screen.queryByText("Entendi, iniciar atendimento")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("offers a safe retry instead of creating another conversation when resumption fails", async () => {
    resume.mockRejectedValueOnce(new Error("network unavailable"));
    render(<StoreAssistantPanel {...props()}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Tentar retomar conversa" }));
    await screen.findByRole("button", { name: "Entendi, iniciar atendimento" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("ignores a previous account's delayed resumed history after logout", async () => {
    let resolve!: (response: Response) => void;
    resume.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    const p = props(), { rerender } = render(<StoreAssistantPanel {...p} buyerId="buyer-a"/>);
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    rerender(<StoreAssistantPanel {...p} buyerId={undefined}/>);
    resolve(response([{ id: "private", role: "assistant", text: "Histórico da conta anterior", cards: [] }]));
    await screen.findByText(/Sua conta mudou/);
    expect(screen.queryByText("Histórico da conta anterior")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendi, iniciar atendimento" })).toBeInTheDocument();
  });
  it("shows freight prices and deadlines without advertising insurance", () => {
    const card: AssistantCard = { kind: "shipping", options: [{ id: "sedex", name: "SEDEX", priceCents: 2200, transitDays: 2, insuranceValueCents: 9500, estimate: deliveryEstimate(100, 2) }], warnings: [] };
    const { container } = render(<StoreAssistantCards card={card} api="/api/store/test" base="/loja/test" identified={false} busy={false} confirmed={[]} onLogin={vi.fn()} onClose={vi.fn()} onQuote={vi.fn()} onConfirm={vi.fn()} onHandoff={vi.fn()}/>);
    expect(screen.getByText(/SEDEX/)).toHaveTextContent("22,00");
    expect(screen.getByText(/Produção:/)).toHaveTextContent("transporte: 2 dias úteis");
    expect(container.textContent).not.toMatch(/seguro|valor declarado|95,00/i);
  });
  it("does not create a conversation or send any model request before explicit consent", async () => {
    render(<StoreAssistantPanel {...props()}/>); expect(fetcher).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: "Entendi, iniciar atendimento" });
    expect(screen.getByText(/inteligência artificial/)).toBeInTheDocument(); expect(screen.getByText(/por até 30 dias/)).toBeInTheDocument();
    expect(screen.getByRole("dialog").textContent).not.toMatch(/openrouter|provedor|\bZDR\b|guardrails/i);
    expect(screen.getByText(/Não envie documentos pessoais/)).toBeInTheDocument();
    fetcher.mockResolvedValueOnce(response()); await consent();
    await screen.findByRole("textbox", { name: "Mensagem para o assistente" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: "start", consent: true });
  });
  it("streams real progress, uses the official returned history, and never parses model text as HTML", async () => {
    fetcher.mockResolvedValueOnce(response()); render(<StoreAssistantPanel {...props()}/>);
    await consent(); await screen.findByRole("textbox");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ type: "status", text: "Buscando catálogo" }) + "\n" + JSON.stringify({ type: "done", messages: [{ id: "m", role: "assistant", text: "<script>nunca executar</script>", cards: [] }] }) + "\n", { headers: { "content-type": "application/x-ndjson" } }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quero bottons" } }); fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await screen.findByText("<script>nunca executar</script>"); expect(document.querySelector("script")).toBeNull();
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ action: "message", conversationId: ids.conv, text: "Quero bottons" });
  });
  it("confirms a proposal explicitly and trusts server authentication rather than a stale UI hint", async () => {
    const cart = { customer: { id: "buyer", name: "Cliente", email: "cliente@example.test" }, lines: [{}] };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.action === "start") return response([{ id: "m", role: "assistant", text: "Revise sua proposta", cards: [proposal] }]);
      if (body.action === "confirm") return Response.json({ cart, message: "Proposta adicionada" });
      if (String(url).endsWith("/cart")) return Response.json(cart);
      if (String(url).endsWith("/quotes")) return Response.json({ id: ids.quote });
      if (body.action === "quote_saved") return Response.json({ messages: [{ id: "saved", role: "assistant", text: "Pronto", cards: [{ kind: "quote_saved", quoteId: ids.quote, totalCents: 10000 }] }] });
      throw new Error("Unexpected API call");
    });
    const p = props(); render(<StoreAssistantPanel {...p} buyerId="buyer"/>);
    await consent();
    fireEvent.click(await screen.findByText("Confirmar e adicionar ao carrinho"));
    await waitFor(() => expect(p.onCartChanged).toHaveBeenCalledTimes(1));
    // start returns the exact server authentication state, not the passed UI hint.
    fireEvent.click(screen.getByText("Salvar orçamento em PDF"));
    await screen.findByRole("heading", { name: "Acesso seguro à sua conta" });
  });
  it("saves through the private form and exposes a PDF without sending billing data to chat", async () => {
    const cart = { customer: { id: "buyer" }, lines: [{}] };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.action === "start") return Response.json({ conversation: { id: ids.conv }, customer: true, messages: [{ id: "m", role: "assistant", text: "Proposta", cards: [proposal] }] });
      if (body.action === "confirm") return Response.json({ cart, message: "Itens adicionados" });
      if (String(url).endsWith("/cart")) return Response.json(cart);
      if (String(url).endsWith("/quotes")) return Response.json({ id: ids.quote });
      if (body.action === "quote_saved") return Response.json({ messages: [{ id: "saved", role: "assistant", text: "Orçamento salvo", cards: [{ kind: "quote_saved", quoteId: ids.quote, totalCents: 10000 }] }] });
      throw new Error("Unexpected request");
    });
    render(<StoreAssistantPanel {...props()} buyerId="buyer"/>);
    await consent(); fireEvent.click(await screen.findByText("Confirmar e adicionar ao carrinho"));
    fireEvent.click(await screen.findByText("Salvar orçamento em PDF")); fireEvent.click(await screen.findByText("Confirmar orçamento de teste"));
    const pdf = await screen.findByRole("link", { name: "Baixar PDF" }); expect(pdf).toHaveAttribute("href", `/api/store/test/quotes/${ids.quote}/pdf`);
    const chatBodies = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/assistant")).map(([, init]) => init.body);
    expect(JSON.stringify(chatBodies)).not.toContain("52998224725");
    expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith("/quotes") && init.body.includes("52998224725"))).toBe(true);
  });
  it("clears another account's private transcript immediately on logout", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ conversation: { id: ids.conv }, customer: true, messages: [{ id: "own", role: "assistant", text: "Seu histórico privado", cards: [] }] }));
    const p = props(), { rerender } = render(<StoreAssistantPanel {...p} buyerId="buyer-a"/>);
    await consent(); await screen.findByText("Seu histórico privado");
    rerender(<StoreAssistantPanel {...p} buyerId={undefined}/>);
    expect(screen.queryByText("Seu histórico privado")).not.toBeInTheDocument(); expect(screen.getByText(/Sua conta mudou/)).toBeInTheDocument();
  });
  it("requires login for restricted documents and hides the launcher when disabled", async () => {
    const onLogin = vi.fn();
    const { unmount } = render(<StoreAssistantCards card={{ kind: "company", company: { legalName: "", document: "", address: "", bankName: "", agency: "", account: "", accountType: "", beneficiary: "", pixKey: "" }, documents: [{ id: ids.quote, label: "Espelho bancário", file_name: "espelho.pdf", file_size: 100, visibility: "identified", created_at: "2026-01-01" }] }} api="/api/store/test" base="/loja/test" identified={false} busy={false} confirmed={[]} onLogin={onLogin} onClose={vi.fn()} onQuote={vi.fn()} onConfirm={vi.fn()} onHandoff={vi.fn()}/>);
    expect(screen.queryByRole("link", { name: /Espelho/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Identifique-se/ })); expect(onLogin).toHaveBeenCalled(); unmount();
    fetcher.mockResolvedValueOnce(Response.json({ enabled: false })); render(<StoreAssistantLauncher api="/api/store/test" base="/loja/test" settings={settings} onCartChanged={vi.fn()}/>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); expect(screen.queryByRole("button", { name: /Abrir assistente/ })).not.toBeInTheDocument();
  });
});
