import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPersonalizer } from "@/components/commerce/StudioPersonalizer";
import { renderStudioArtwork } from "@/components/commerce/studio-artwork-canvas";
import type { StoreProduct } from "@/components/commerce/StoreHome";
import { defaultMockup } from "@/domain/commerce/artwork-options";
import { saveStudioPurchase } from "@/components/commerce/studio-purchase";
import { readStudioDraft, writeStudioDraft } from "@/components/commerce/studio-draft-cache";
import { studioInitialArtwork } from "@/domain/commerce/studio-demo";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const mockups = vi.hoisted(() => ({ automatic: true, pending: new Map<string, () => void>() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/commerce/studio-purchase", () => ({ saveStudioPurchase: vi.fn(async () => "saved-art") }));
vi.mock("@/components/commerce/studio-draft-cache", () => ({ readStudioDraft: vi.fn(async () => null), writeStudioDraft: vi.fn(async () => true) }));
vi.mock("@/components/commerce/studio-image", () => ({ readStudioBackground: vi.fn(async () => ({ dataUrl: "data:image/png;base64,YQ==", fileName: "fundo.png", width: 1200, height: 800 })) }));
vi.mock("@/components/commerce/studio-artwork-canvas", () => ({ renderStudioArtwork: vi.fn(async () => ({ dataUrl: "data:image/png;base64,YQ==", truncated: false, mimeType: "image/png", fileSize: 1 })) }));
vi.mock("@/components/commerce/StoreProductMockup", () => ({ StoreProductMockup: ({ fixedSide, sourceUrl, onRenderSettled }: { fixedSide: string; sourceUrl: string; onRenderSettled?: (url: string) => void }) => {
  React.useEffect(() => { const ready = () => onRenderSettled?.(sourceUrl); mockups.pending.set(fixedSide, ready); if (mockups.automatic) ready(); }, [fixedSide, sourceUrl, onRenderSettled]);
  return <canvas aria-label={fixedSide === "front" ? "Frente do exemplo" : "Verso do exemplo"}/>;
} }));
const products = [{ id: "demo", name: "Botton 3,5 cm", personalized: true, geometry: { shape: "circle", widthMm: 35, heightMm: 35 }, margins: { safeMarginMm: 3, bleedMm: 3 }, artworkOptions: { mockup: defaultMockup() } }] as StoreProduct[];
afterEach(() => { cleanup(); mockups.automatic = true; mockups.pending.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function introEnvironment(reduced = false) {
  vi.useFakeTimers();
  const media = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return media;
}
async function advanceIntro(milliseconds: number) {
  await act(async () => { vi.advanceTimersByTime(milliseconds); });
  await act(async () => { vi.advanceTimersByTime(200); });
}
async function settleIntroStage(stage: number | "complete") {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (document.querySelector("[data-studio-demo-stage]")?.getAttribute("data-studio-demo-stage") === String(stage) && document.querySelector("[data-studio-demo-transition]")?.getAttribute("data-studio-demo-transition") === "idle") return;
    await advanceIntro(100);
  }
  throw new Error(`The studio did not settle at stage ${stage}.`);
}
describe("studio creative demonstration", () => {
  it("fades out before changing the artwork and waits for both rendered sides before fading in", async () => {
    introEnvironment();
    vi.mocked(renderStudioArtwork).mockResolvedValueOnce({ dataUrl: "old", truncated: false, mimeType: "image/png", fileSize: 1 }).mockResolvedValueOnce({ dataUrl: "new", truncated: false, mimeType: "image/png", fileSize: 1 });
    const view = render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200); mockups.automatic = false;
    await advanceIntro(500);
    const preview = view.container.querySelector("[data-studio-demo-transition]")!;
    expect(preview).toHaveAttribute("data-studio-demo-transition", "out");
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    await advanceIntro(300); await advanceIntro(300);
    expect(preview).toHaveAttribute("data-studio-demo-transition", "waiting");
    act(() => mockups.pending.get("front")!());
    expect(preview).toHaveAttribute("data-studio-demo-transition", "waiting");
    act(() => mockups.pending.get("back")!());
    expect(preview).toHaveAttribute("data-studio-demo-transition", "in");
    await advanceIntro(400);
    expect(preview).toHaveAttribute("data-studio-demo-transition", "idle");
    expect(saveStudioPurchase).not.toHaveBeenCalled(); expect(writeStudioDraft).not.toHaveBeenCalled();
  });
  it("cancels a pending fade when the customer starts editing without replacing their message", async () => {
    introEnvironment();
    const view = render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200); await advanceIntro(500);
    expect(view.container.querySelector("[data-studio-demo-transition]")).toHaveAttribute("data-studio-demo-transition", "out");
    fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "Minha arte, sem interrupções" } });
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Minha arte, sem interrupções");
    expect(view.container.querySelector("[data-studio-demo-transition]")).toHaveAttribute("data-studio-demo-transition", "idle");
  });
  it("cancels a fade immediately when reduced motion is enabled during playback", async () => {
    const media = introEnvironment();
    const view = render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200); await advanceIntro(500);
    media.matches = true;
    act(() => media.addEventListener.mock.calls.find(([event]) => event === "change")![1]());
    expect(view.container.querySelector("[data-studio-demo-transition]")).toHaveAttribute("data-studio-demo-transition", "idle");
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    expect(screen.getByText("Agora crie você mesmo a sua arte.")).toBeVisible();
  });
  it("restores the last composition without replaying the demo and keeps it when choosing a different product", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const draft = { version: 1 as const, updatedAt: Date.now(), productId: "demo", artwork: { ...studioInitialArtwork(), text: "Minha composição salva", mode: "circle" as const } };
    vi.mocked(readStudioDraft).mockResolvedValueOnce(draft);
    const second = { ...products[0], id: "second", name: "Espelho", geometry: { ...products[0].geometry!, widthMm: 55, heightMm: 55 } };
    render(<StudioPersonalizer products={[products[0], second]} base="/loja/store" slug="store" autoDemo/>);
    expect(await screen.findByText("Sua última arte foi recuperada.")).toBeInTheDocument();
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue(draft.artwork.text);
    expect(screen.queryByRole("button", { name: "Pular demonstração" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Produto" }), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "Nova arte" }));
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    expect(screen.getByRole("combobox", { name: "Produto" })).toHaveValue("second");
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue(draft.artwork.text);
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Usar esta arte no produto" }));
    await waitFor(() => expect(saveStudioPurchase).toHaveBeenCalledWith(expect.objectContaining({ productId: "second" })));
    expect(writeStudioDraft).toHaveBeenCalledWith({ slug: "store", preview: false }, expect.objectContaining({ productId: "second", artwork: expect.objectContaining({ text: draft.artwork.text }) }));
    expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.anything(), second.geometry, second.margins, { purpose: "purchase" });
  });
  it("offers ready-made artwork only if this store has its library enabled", async () => {
    render(<StudioPersonalizer products={products} base="" slug="store" libraryEnabled/>);
    await screen.findByLabelText("Frente do exemplo");
    fireEvent.click(screen.getByRole("tab", { name: "Fundo" }));
    fireEvent.click(screen.getByRole("button", { name: "Imagem" }));
    expect(screen.getByRole("button", { name: "Escolher entre nossas artes prontas" })).toBeInTheDocument();
  });
  it("automatically shows a longer message, circle, spiral, three colors and a spiral background, then invites creation without saving", async () => {
    introEnvironment();
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await settleIntroStage(0);
    const message = screen.getByLabelText("Sua mensagem") as HTMLTextAreaElement;
    expect(message.value.length).toBeGreaterThan(40);
    expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeDisabled();
    await settleIntroStage(1);
    expect(screen.getByRole("button", { name: "Texto circular" })).toHaveAttribute("aria-pressed", "true");
    await settleIntroStage(2);
    expect(screen.getByRole("button", { name: "Texto em espiral" })).toHaveAttribute("aria-pressed", "true");
    await settleIntroStage(3);
    expect(screen.getByRole("tab", { name: "Fundo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByLabelText(/^Cor do fundo \d$/)).toHaveLength(3);
    await settleIntroStage(4);
    expect(screen.getByLabelText("Formato do fundo")).toHaveValue("spiral");
    await settleIntroStage("complete");
    expect(screen.getByText("Agora crie você mesmo a sua arte.")).toBeVisible();
    expect(saveStudioPurchase).not.toHaveBeenCalled(); expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar minha arte" }));
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
    await advanceIntro(200);
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
  it("does not move the checkbox under the pointer before its click is completed", async () => {
    introEnvironment(true);
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(200);
    const checkbox = screen.getByRole("checkbox", { name: "Incluir texto sobre o fundo" });
    fireEvent.pointerDown(checkbox);
    expect(screen.getByText("Agora crie você mesmo a sua arte.")).toBeVisible();
    fireEvent.pointerUp(checkbox); fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText("Agora crie você mesmo a sua arte.")).not.toBeInTheDocument();
  });
  it("pauses while the tab is hidden instead of playing through unseen steps", async () => {
    introEnvironment();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<StudioPersonalizer products={products} base="" slug="store" autoDemo/>);
    await advanceIntro(20000);
    expect(screen.getByLabelText("Sua mensagem")).toHaveValue("Sua ideia\nganha forma");
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await settleIntroStage(0);
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
  it("keeps an uploaded image and an empty message when previewing and exporting the customer's composition", async () => {
    render(<StudioPersonalizer products={products} base="/loja/store" slug="store"/>);
    await screen.findByLabelText("Frente do exemplo");
    fireEvent.click(screen.getByRole("tab", { name: "Fundo" }));
    fireEvent.click(screen.getByRole("button", { name: "Imagem" }));
    fireEvent.change(screen.getByLabelText("Enviar imagem de fundo"), { target: { files: [new File(["image"], "fundo.png", { type: "image/png" })] } });
    await screen.findByAltText("Imagem de fundo escolhida");
    fireEvent.click(screen.getByRole("tab", { name: "Texto" }));
    fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "" } });
    await waitFor(() => expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ text: "", backgroundType: "image", backgroundImage: expect.anything() }), products[0].geometry, products[0].margins));
    await waitFor(() => expect(screen.getByRole("button", { name: "Usar esta arte no produto" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Usar esta arte no produto" }));
    await waitFor(() => expect(saveStudioPurchase).toHaveBeenCalledTimes(1));
    expect(renderStudioArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ text: "", backgroundType: "image", backgroundImage: expect.anything() }), products[0].geometry, products[0].margins, { purpose: "purchase" });
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
