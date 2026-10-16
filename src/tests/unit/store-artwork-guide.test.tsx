import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StoreArtworkGuide } from "@/components/commerce/StoreArtworkGuide";
import type { PrintGeometry } from "@/domain/artwork/geometry";

afterEach(cleanup);
const geometry: PrintGeometry = { shape: "circle", widthMm: 53, heightMm: 53, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
function downloadedSvg() {
  const href = screen.getByRole("link", { name: "Baixar guia SVG" }).getAttribute("href")!;
  return new DOMParser().parseFromString(decodeURIComponent(href.slice(href.indexOf(",") + 1)), "image/svg+xml");
}

describe("store artwork guide", () => {
  it("offers a true-size download and a collapsible preview independent of the cart or quantity", () => {
    const view = render(<StoreArtworkGuide productName="Botton" geometry={geometry} margins={{ safeMarginMm: 1.5, bleedMm: 2 }} />);
    expect(screen.getByRole("link", { name: "Baixar guia SVG" })).toHaveAttribute("download", "guia-botton-60x60mm.svg");
    expect(downloadedSvg().documentElement.getAttribute("width")).toBe("60mm");
    expect(view.container.querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Ver marcações e medidas"));
    expect(view.container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("Ø 53 mm")).toBeVisible();
    expect(screen.getByText("Ø 56 mm")).toBeVisible();
    expect(screen.getByText("Ø 60 mm")).toBeVisible();
    expect(screen.getByText(/continue o fundo até o corte externo/)).toBeVisible();
    expect(screen.getByText(/oculte as marcações/)).toBeVisible();
  });

  it("refreshes the SVG and the displayed dimensions when product settings change", () => {
    const view = render(<StoreArtworkGuide productName="Produto" geometry={geometry} margins={{ safeMarginMm: 1, bleedMm: 2 }} />);
    view.rerender(<StoreArtworkGuide productName="Retangular" geometry={{ ...geometry, shape: "rectangle", widthMm: 80, heightMm: 50 }} margins={{ safeMarginMm: 2, bleedMm: 3 }} />);
    expect(downloadedSvg().documentElement.getAttribute("width")).toBe("90mm");
    expect(downloadedSvg().documentElement.getAttribute("height")).toBe("60mm");
    expect(screen.getByText("80 × 50 mm")).toBeInTheDocument();
    expect(screen.getByText("84 × 54 mm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baixar guia SVG" })).toHaveAttribute("download", "guia-retangular-90x60mm.svg");
  });

  it("does not offer an inaccurate template when the product has no valid geometry", () => {
    const view = render(<StoreArtworkGuide productName="Sem molde" geometry={null} margins={{ safeMarginMm: 2, bleedMm: 2 }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    view.rerender(<StoreArtworkGuide productName="Sem molde" geometry={geometry} margins={{ safeMarginMm: -1, bleedMm: 2 }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
