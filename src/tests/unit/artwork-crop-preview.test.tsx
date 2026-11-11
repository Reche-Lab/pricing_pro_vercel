import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtworkCropEditor } from "@/components/quotes/ArtworkCropEditor";

const props = {
  artwork: {
    id: "art",
    artwork_name: "Teste",
    file_name: "arte.png",
    crop_scale: "1",
    crop_offset_x: "0",
    crop_offset_y: "0",
    rotation_degrees: "0",
  },
  geometry: {
    shape: "circle" as const,
    widthMm: 35,
    heightMm: 35,
    cornerStyle: "sharp" as const,
    cornerRadiusMm: 0,
    rotationDegrees: 0,
    allowPrintRotation: true,
  },
  bleedMm: 2,
  safeMarginMm: 2,
  imageUrl: "data:image/png;base64,YWJj",
  itemId: "item",
  quoteId: "quote",
  onClose: vi.fn(),
  onSaved: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("crop preparation adapters", () => {
  it("previews a removable background and submits it with the frame without incorporating the image", async () => {
    const onPrepare = vi.fn().mockResolvedValue(undefined), renderPreview = vi.fn(() => null);
    render(<ArtworkCropEditor {...props} onPrepare={onPrepare} renderPreview={renderPreview}/>);
    fireEvent.change(screen.getByLabelText("Cor do fundo"), { target: { value: "#247a9f" } });
    expect(document.querySelector('path[data-artwork-background]')).toHaveAttribute("fill", "#247a9f");
    expect(renderPreview).toHaveBeenLastCalledWith(expect.objectContaining({ backgroundColor: "#247a9f" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparar arte" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(expect.objectContaining({ backgroundColor: "#247a9f" })));
    fireEvent.click(screen.getByRole("button", { name: "Remover cor de fundo" }));
    expect(document.querySelector('path[data-artwork-background]')).toHaveAttribute("fill", "white");
  });
  it("keeps horizontal and vertical displacement when preparing the artwork", async () => {
    const onPrepare = vi.fn().mockResolvedValue(undefined);
    render(<ArtworkCropEditor {...props} onPrepare={onPrepare} />);
    fireEvent.change(screen.getByRole("slider", { name: /Posição horizontal/ }), { target: { value: "0.3" } });
    fireEvent.change(screen.getByRole("slider", { name: /Posição vertical/ }), { target: { value: "-0.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Preparar arte" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({ scale: 1, offsetX: 0.3, offsetY: -0.2, rotationDegrees: 0 }));
  });
  it("uses the preview callback without calling the real quote API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onPrepare = vi.fn().mockResolvedValue(undefined);
    render(<ArtworkCropEditor {...props} onPrepare={onPrepare} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar arte" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(onPrepare).toHaveBeenCalledWith({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationDegrees: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains the existing public preparation endpoint", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    render(
      <ArtworkCropEditor
        {...props}
        prepareUrl="/api/store/test/artworks/art"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preparar arte" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/store/test/artworks/art",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("shows a failure and releases the button after a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Conexão indisponível")),
    );
    render(<ArtworkCropEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar arte" }));
    await screen.findByText("Conexão indisponível");
    expect(screen.getByRole("button", { name: "Preparar arte" })).toBeEnabled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });
});
