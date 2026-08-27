import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintGeometryFields } from "@/components/products/PrintGeometryFields";

describe("print geometry fields", () => {
  it("shows all three guide dimensions as absolute values", () => {
    const { container } = render(<PrintGeometryFields defaults={{
      shape: "circle",
      widthMm: 45,
      heightMm: 45,
      safeMarginMm: 2,
      bleedMm: 3
    }} />);

    expect(screen.getByLabelText(/Segurança · Diâmetro total/)).toHaveValue(45);
    expect(screen.getByLabelText(/Sangria · Diâmetro total/)).toHaveValue(49);
    expect(screen.getByLabelText(/Corte · Diâmetro total/)).toHaveValue(55);
    expect(screen.getByText("2 mm por lado após a Segurança.")).toBeInTheDocument();
    expect(screen.getByText("3 mm por lado após a Sangria.")).toBeInTheDocument();
    expect(hiddenValue(container, "printWidthMm")).toBe("45");
    expect(hiddenValue(container, "printSafeMarginMm")).toBe("2");
    expect(hiddenValue(container, "printBleedMm")).toBe("3");
  });

  it("converts absolute diameters into internal per-side increments", () => {
    const { container } = render(<PrintGeometryFields />);

    fireEvent.change(screen.getByLabelText(/Segurança · Diâmetro total/), { target: { value: "53" } });
    fireEvent.change(screen.getByLabelText(/Sangria · Diâmetro total/), { target: { value: "56" } });
    fireEvent.change(screen.getByLabelText(/Corte · Diâmetro total/), { target: { value: "59" } });
    expect(hiddenValue(container, "printWidthMm")).toBe("53");
    expect(hiddenValue(container, "printSafeMarginMm")).toBe("1.5");
    expect(hiddenValue(container, "printBleedMm")).toBe("1.5");
    expect(screen.getByText("Sangria: 56 mm")).toBeInTheDocument();
    expect(screen.getByText("Corte: 59 mm")).toBeInTheDocument();
  });
});

function hiddenValue(container: HTMLElement, name: string) {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
}
