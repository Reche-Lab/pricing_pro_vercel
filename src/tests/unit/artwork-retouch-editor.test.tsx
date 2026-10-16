import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtworkRetouchEditor } from "@/components/quotes/ArtworkRetouchEditor";
import { drawArtworkFrame } from "@/components/quotes/artwork-frame-canvas";
import { DEFAULT_RETOUCH_ADJUSTMENTS } from "@/domain/artwork/retouch";

vi.mock("@/components/quotes/artwork-frame-canvas", () => ({ drawArtworkFrame: vi.fn() }));
const initialCrop = { scale: 0.8, offsetX: 0.3, offsetY: -0.2, rotationDegrees: 25 };
const props = {
  artworkName: "Arte teste", fileName: "arte.png", imageUrl: "/arte.png", initialCrop,
  geometry: { shape: "circle" as const, widthMm: 53, heightMm: 53, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
  bleedMm: 2, safeMarginMm: 1.5, onClose: vi.fn(), onSave: vi.fn(), onContinue: vi.fn()
};
let resize: () => void;
let viewport = { width: 640, height: 360 };
beforeEach(() => {
  viewport = { width: 640, height: 360 };
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => viewport.width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => viewport.height);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() } as unknown as CanvasRenderingContext2D;
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() {}
  });
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1200, height: 800, close: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["art"]), json: async () => ({ draft: null }) }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function loaded() {
  await waitFor(() => expect(screen.queryByText("Carregando imagem...")).not.toBeInTheDocument());
  return screen.getByLabelText("Editor da arte Arte teste") as HTMLCanvasElement;
}

describe("retouch framing and fitted viewport", () => {
  it("inherits crop scale, offset and rotation without extra margins and fits by height", async () => {
    render(<ArtworkRetouchEditor {...props} />);
    const canvas = await loaded();
    expect(drawArtworkFrame).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1200, 800, 800, 800, initialCrop);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(800);
    expect(canvas.parentElement?.style.width).toBe("360px");
    expect(canvas.parentElement?.style.height).toBe("360px");
    expect(screen.getByText("Ajustado")).toBeInTheDocument();
  });
  it("keeps view zoom and expansion separate from artwork edits and readjusts after resizing", async () => {
    render(<ArtworkRetouchEditor {...props} />);
    const canvas = await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    expect(canvas.parentElement?.style.width).toBe("450px");
    fireEvent.click(screen.getByRole("button", { name: "Ajustar à tela" }));
    expect(canvas.parentElement?.style.width).toBe("360px");
    fireEvent.click(screen.getByRole("button", { name: "Expandir editor" }));
    expect(screen.getByRole("button", { name: "Restaurar tamanho do editor" })).toHaveAttribute("aria-pressed", "true");
    viewport = { width: 300, height: 600 };
    act(() => resize());
    expect(canvas.parentElement?.style.width).toBe("300px");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Expandir editor" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Ir para enquadramento" }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onContinue).toHaveBeenCalledOnce();
  });
  it("restores a framed draft using its own crop, not a subsequently changed crop", async () => {
    const sourceCrop = { ...initialCrop, offsetX: -0.4 };
    vi.mocked(fetch).mockImplementation(async (url) => url === "/draft"
      ? { ok: true, json: async () => ({ draft: { version: 1, sourceCrop, operations: [], adjustments: DEFAULT_RETOUCH_ADJUSTMENTS } }) } as Response
      : { ok: true, blob: async () => new Blob(["art"]) } as Response);
    render(<ArtworkRetouchEditor {...props} draftUrl="/draft" />);
    await loaded();
    expect(drawArtworkFrame).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 1200, 800, 800, 800, sourceCrop);
  });
  it("preserves the coordinate system of older drafts instead of moving their strokes", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => url === "/draft"
      ? { ok: true, json: async () => ({ draft: { version: 1, operations: [], adjustments: DEFAULT_RETOUCH_ADJUSTMENTS } }) } as Response
      : { ok: true, blob: async () => new Blob(["art"]) } as Response);
    render(<ArtworkRetouchEditor {...props} draftUrl="/draft" />);
    const canvas = await loaded();
    expect(canvas.width).toBe(1632);
    expect(canvas.height).toBe(1632);
    expect(drawArtworkFrame).not.toHaveBeenCalled();
  });
});
