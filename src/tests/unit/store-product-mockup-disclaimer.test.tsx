import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProductMockup } from "@/components/commerce/StoreProductMockup";
import { defaultMockup } from "@/domain/commerce/artwork-options";

const props = {
  name: "Botton", sourceUrl: "/arte.png",
  geometry: { shape: "circle" as const, widthMm: 35, heightMm: 35, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
  margins: { bleedMm: 2, safeMarginMm: 2 }
};
beforeEach(() => { vi.stubGlobal("Image", class { src = ""; crossOrigin = ""; }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("illustrative product preview notice", () => {
  it("settles failed previews, ignores canceled renders and does not redraw when only the callback changes", async () => {
    const pending: { url: string; fail: () => void }[] = [];
    vi.stubGlobal("Image", class {
      onerror: (() => void) | null = null;
      set src(url: string) { pending.push({ url, fail: () => this.onerror?.() }); }
    });
    const first = vi.fn(), second = vi.fn(), latest = vi.fn(), ready = vi.fn(), failed = vi.fn();
    const view = render(<StoreProductMockup {...props} onRenderSettled={first} onRenderReady={ready} onRenderError={failed}/>);
    await waitFor(() => expect(pending).toHaveLength(1));
    view.rerender(<StoreProductMockup {...props} sourceUrl="/nova.png" onRenderSettled={second} onRenderReady={ready} onRenderError={failed}/>);
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0].fail());
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
    await act(async () => pending[1].fail());
    expect(second).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledWith("/nova.png");
    expect(failed).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledWith(expect.stringContaining("Não foi possível carregar"));
    expect(ready).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    view.rerender(<StoreProductMockup {...props} sourceUrl="/nova.png" onRenderSettled={latest}/>);
    expect(pending).toHaveLength(2); expect(latest).not.toHaveBeenCalled();
  });
  it("keeps the notice visible on both sides and when enlarged", () => {
    render(<StoreProductMockup {...props} model={defaultMockup()} />);
    expect(screen.getByText("Imagem meramente ilustrativa.")).toBeVisible();
    expect(screen.getByLabelText("Botton: frente com a arte enquadrada")).toHaveAccessibleDescription(/principalmente na parte traseira e no modelo do fecho/);
    fireEvent.click(screen.getByRole("button", { name: "Verso" }));
    expect(screen.getByText("Imagem meramente ilustrativa.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar produto" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Imagem meramente ilustrativa.");
    expect(screen.getByRole("dialog")).toHaveTextContent("principalmente na parte traseira e no modelo do fecho");
  });
  it("also explains variations for previews without a photographic model", () => {
    render(<StoreProductMockup {...props} />);
    expect(screen.getByText("Imagem meramente ilustrativa.")).toBeVisible();
    expect(screen.getByText(/Visualização esquemática, sem foto do acabamento/)).toBeVisible();
  });
  it("lets compact studio faces expand independently with a notice and return using Escape", () => {
    render(<StoreProductMockup {...props} model={defaultMockup()} compact expandable fixedSide="front"/>);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar frente do produto" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Imagem meramente ilustrativa.");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ampliar frente do produto" })).toHaveFocus();
  });
});
