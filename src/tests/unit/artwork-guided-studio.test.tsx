import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtworkGuidedStudio } from "@/components/quotes/ArtworkGuidedStudio";
import { ArtworkCropEditor } from "@/components/quotes/ArtworkCropEditor";
import type { ArtworkStudioAsset } from "@/components/quotes/artwork-studio-types";
import type { ArtworkRetouchEditor } from "@/components/quotes/ArtworkRetouchEditor";

vi.mock("next/dynamic", () => ({ default: (loader: () => unknown) => {
  if (loader.toString().includes("ArtworkCropEditor")) return function Crop(props: React.ComponentProps<typeof ArtworkCropEditor>) { return <ArtworkCropEditor {...props} />; };
  return function Retouch(props: React.ComponentProps<typeof ArtworkRetouchEditor>) { return <div>{props.navigation}<p>Retoque em teste</p><button onClick={async () => {
    await props.onSave({ fileName: "nova.webp", mimeType: "image/webp", fileSize: 3, dataUrl: "data:image/webp;base64,YWJj" });
    props.onContinue?.();
  }}>Salvar e enquadrar</button></div>; };
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const asset: ArtworkStudioAsset = {
  id: "original", name: "Arte 1", fileName: "original.png", sourceUrl: "/original.png",
  geometry: { shape: "circle", widthMm: 35, heightMm: 35, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
  margins: { bleedMm: 2, safeMarginMm: 2 }, crop: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 }, approved: false,
};
function callbacks() {
  return { onRetouch: vi.fn().mockResolvedValue({ ...asset, id: "retouched", sourceUrl: "/retouched.webp", approved: true, crop: { ...asset.crop, scale: 2 } }),
    onPrepare: vi.fn().mockImplementation(async (current, crop) => ({ ...current, crop, preparedUrl: "/prepared.webp" })),
    onApprove: vi.fn().mockResolvedValue(undefined), onClose: vi.fn() };
}
describe("guided artwork workflow", () => {
  it("keeps the new version in the studio, resets its crop and requires final review before approval", async () => {
    const handlers = callbacks();
    handlers.onApprove.mockRejectedValueOnce(new Error("Aprovação indisponível"));
    render(<ArtworkGuidedStudio initialAsset={asset} {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "Retocar arte" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar e enquadrar" }));
    await screen.findByText("Centralizar e enquadrar arte");
    expect(screen.getByRole("slider", { name: /Zoom/ })).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const final = await screen.findByAltText("Arte final para aprovação");
    expect(handlers.onPrepare).toHaveBeenCalledWith(expect.objectContaining({ id: "retouched", approved: false }), asset.crop);
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aprovar arte" })).toBeDisabled();
    fireEvent.load(final);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar arte" }));
    await screen.findByRole("alert");
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar arte" }));
    await screen.findByText("Esta versão está aprovada.");
    expect(handlers.onApprove).toHaveBeenLastCalledWith(expect.objectContaining({ id: "retouched" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
  it("asks before losing crop edits and keeps the editor open when saving fails", async () => {
    const handlers = callbacks();
    handlers.onPrepare.mockRejectedValue(new Error("Falha ao salvar enquadramento"));
    render(<ArtworkGuidedStudio initialAsset={asset} {...handlers} />);
    fireEvent.change(screen.getByRole("slider", { name: /Zoom/ }), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Fechar enquadramento" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("slider", { name: /Zoom/ })).toHaveValue("1.5");
    fireEvent.click(screen.getByRole("button", { name: "Fechar enquadramento" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar"));
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar e continuar" }));
    await waitFor(() => expect(handlers.onClose).toHaveBeenCalledOnce());
  });
  it("saves crop coordinates before switching to retouch and never approves implicitly", async () => {
    const handlers = callbacks();
    render(<ArtworkGuidedStudio initialAsset={asset} {...handlers} />);
    fireEvent.change(screen.getByRole("slider", { name: /Posição horizontal/ }), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Retocar arte" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await screen.findByText("Retoque em teste");
    expect(handlers.onPrepare).toHaveBeenCalledWith(asset, { ...asset.crop, offsetX: 0.4 });
    expect(handlers.onApprove).not.toHaveBeenCalled();
  });
});
