import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPersonalizer } from "@/components/commerce/StudioPersonalizer";
import { renderStudioArtwork } from "@/components/commerce/studio-artwork-canvas";
import type { StoreProduct } from "@/components/commerce/StoreHome";
import { defaultMockup } from "@/domain/commerce/artwork-options";
import { saveStudioPurchase } from "@/components/commerce/studio-purchase";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/commerce/studio-purchase", () => ({ saveStudioPurchase: vi.fn(async () => "saved-art") }));
vi.mock("@/components/commerce/studio-image", () => ({ readStudioBackground: vi.fn(async () => ({ dataUrl: "data:image/png;base64,YQ==", fileName: "fundo.png", width: 1200, height: 800 })) }));
vi.mock("@/components/commerce/studio-artwork-canvas", () => ({ renderStudioArtwork: vi.fn(async () => ({ dataUrl: "data:image/png;base64,YQ==", truncated: false, mimeType: "image/png", fileSize: 1 })) }));
vi.mock("@/components/commerce/StoreProductMockup", () => ({ StoreProductMockup: ({ fixedSide }: { fixedSide: string }) => <canvas aria-label={fixedSide === "front" ? "Frente do exemplo" : "Verso do exemplo"}/> }));
const products = [{ id: "demo", name: "Botton 3,5 cm", personalized: true, geometry: { shape: "circle", widthMm: 35, heightMm: 35 }, margins: { safeMarginMm: 3, bleedMm: 3 }, artworkOptions: { mockup: defaultMockup() } }] as StoreProduct[];
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function introEnvironment(reduced = false) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}
async function advanceIntro(milliseconds: number) {
  await act(async () => { vi.advanceTimersByTime(milliseconds); });
  await act(async () => { vi.advanceTimersByTime(200); });
}
describe("studio creative demonstration", () => {
  it("automatically shows a longer message, circle, spiral, three colors and a spiral background, then invites creation without saving", async () => {
    introEnvironment();
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200); await advanceIntro(600);
    const message = screen.getByLabelText("Sua mensagem") as HTMLTextAreaElement;
    expect(message.value.length).toBeGreaterThan(40);
    expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeDisabled();
    await advanceIntro(2000);
    expect(screen.getByRole("button", { name: "Texto circular" })).toHaveAttribute("aria-pressed", "true");
    await advanceIntro(2000);
    expect(screen.getByRole("button", { name: "Texto em espiral" })).toHaveAttribute("aria-pressed", "true");
    await advanceIntro(2000);
    expect(screen.getByRole("tab", { name: "Fundo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByLabelText(/^Cor do fundo \d$/)).toHaveLength(3);
    await advanceIntro(2000);
    expect(screen.getByLabelText("Formato do fundo")).toHaveValue("spiral");
    await advanceIntro(2000);
    expect(screen.getByText("Agora crie você mesmo a sua arte.")).toBeVisible();
    expect(saveStudioPurchase).not.toHaveBeenCalled(); expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar minha arte", exact: true }));
    expect(message).toHaveFocus(); expect(message.selectionEnd).toBe(message.value.length);
  });
  it("stops on editing and never replaces the customer's text later", async () => {
    introEnvironment();
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200); await advanceIntro(600);
    fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "Minha criação de verdade" } });
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Minha criação de verdade");
    expect(screen.queryByRole("button", { name: "Pular demonstração" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Texto" })).toHaveAttribute("aria-selected", "true");
  });
  it("lets the customer skip directly to their own creation and cancels pending steps on unmount", async () => {
    introEnvironment();
    const view = render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    fireEvent.click(screen.getByRole("button", { name: "Pular demonstração" }));
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    expect(screen.getByLabelText("Sua mensagem")).toHaveFocus();
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not autoplay with reduced motion and immediately offers creation", async () => {
    introEnvironment(true);
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(20000);
    expect(screen.getByText("Agora crie você mesmo a sua arte.")).toBeVisible();
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    expect(saveStudioPurchase).not.toHaveBeenCalled();
  });
  it("pauses while the tab is hidden instead of playing through unseen steps", async () => {
    introEnvironment();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await advanceIntro(600);
    expect((screen.getByLabelText("Sua mensagem") as HTMLTextAreaElement).value.length).toBeGreaterThan(40);
  });
  it("cleans up an active demonstration when leaving the studio", async () => {
    introEnvironment();
    const view = render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
    await advanceIntro(20000); expect(saveStudioPurchase).not.toHaveBeenCalled();
  });
  it("shows both sides at once and exposes a multiline message and distinct typography modes", async () => {
    render(<StudioPersonalizer products={products} base="/commerce/store/preview" slug="store"/>);
    expect(await screen.findByLabelText("Frente do exemplo")).toBeInTheDocument();
    expect(screen.getByLabelText("Verso do exemplo")).toBeInTheDocument();
    expect(screen.getByLabelText("Sua mensagem").tagName).toBe("TEXTAREA");
    fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "Uma mensagem\ncom várias linhas" } });
    fireEvent.click(screen.getByRole("button", { name: "Texto em espiral" }));
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "handwritten" } });
    await waitFor(() => expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "spiral", font: "handwritten", text: "Uma mensagem\ncom várias linhas" }), products[0].geometry, products[0].margins));
    expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeInTheDocument();
    expect(screen.getByText(/Simulação ilustrativa/)).toBeInTheDocument();
  });
  it("adds and removes background colors with an explicit limit of four", async () => {
    render(<StudioPersonalizer products={products} base="" slug="store"/>);
    await screen.findByLabelText("Frente do exemplo");
    fireEvent.click(screen.getByRole("tab", { name: "Fundo" }));
    const add = screen.getByRole("button", { name: "Adicionar cor ao fundo" });
    fireEvent.click(add); fireEvent.click(add); fireEvent.click(add);
    expect(screen.getAllByLabelText(/^Cor do fundo \d$/)).toHaveLength(4);
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Formato do fundo"), { target: { value: "spiral" } });
    fireEvent.change(screen.getByLabelText("Cor do fundo 4"), { target: { value: "#334455" } });
    await waitFor(() => expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ gradient: "spiral", colors: expect.arrayContaining(["#334455"]) }), expect.anything(), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Remover cor 4" }));
    expect(screen.getAllByLabelText(/^Cor do fundo \d$/)).toHaveLength(3);
    expect(add).not.toBeDisabled();
  });
  it("supports keyboard navigation between text and background without losing the message", async () => {
    render(<StudioPersonalizer products={products} base="" slug="store"/>);
    await screen.findByLabelText("Frente do exemplo");
    fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "Minha criação" } });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Texto" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Fundo" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Fundo" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Fundo" }), { key: "Home" });
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Minha criação");
  });
  it("uses an uploaded background with scale, position and fill, without saving on each adjustment", async () => {
    render(<StudioPersonalizer products={products} base="" slug="store"/>);
    await screen.findByLabelText("Frente do exemplo");
    fireEvent.click(screen.getByRole("tab", { name: "Fundo" }));
    fireEvent.click(screen.getByRole("button", { name: "Imagem" }));
    fireEvent.change(screen.getByLabelText("Enviar imagem de fundo"), { target: { files: [new File(["image"], "fundo.png", { type: "image/png" })] } });
    await screen.findByAltText("Imagem de fundo escolhida");
    fireEvent.change(screen.getByRole("slider", { name: "Tamanho da imagem" }), { target: { value: ".5" } });
    fireEvent.change(screen.getByRole("slider", { name: "Deslocamento horizontal" }), { target: { value: ".2" } });
    fireEvent.change(screen.getByLabelText("Cor nas áreas descobertas"), { target: { value: "#223344" } });
    await waitFor(() => expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ backgroundType: "image", backgroundImage: expect.objectContaining({ scale: .5, offsetX: .2, fillColor: "#223344" }) }), expect.anything(), expect.anything()));
    expect(saveStudioPurchase).not.toHaveBeenCalled();
  });
  it("exports a fresh print composition, saves once and then navigates to the same tenant's product", async () => {
    render(<StudioPersonalizer products={products} base="/loja/store" slug="store"/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Usar esta arte no produto" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/loja/store/produto/demo?arteEstudio=saved-art"));
    expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.anything(), products[0].geometry, products[0].margins, { purpose: "purchase" });
    expect(saveStudioPurchase).toHaveBeenCalledTimes(1);
    expect(saveStudioPurchase).toHaveBeenCalledWith(expect.objectContaining({ slug: "store", productId: "demo", file: expect.objectContaining({ fileSize: 1, mimeType: "image/png" }) }));
  });
  it("keeps the artwork on failure and does not navigate or allow a duplicate click", async () => {
    vi.mocked(saveStudioPurchase).mockRejectedValueOnce(new Error("Armazenamento indisponível"));
    render(<StudioPersonalizer products={products} base="" slug="store"/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeEnabled());
    const button = screen.getByRole("button", { name: "Usar esta arte no produto" });
    fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Armazenamento indisponível");
    expect(saveStudioPurchase).toHaveBeenCalledTimes(1); expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    expect(button).toBeEnabled();
  });
});
