import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintGeometryFields } from "@/components/products/PrintGeometryFields";

describe("print geometry fields", () => {
  it("uses the persisted geometry as absolute safety and expands sangria from it", () => {
    const { container } = render(<PrintGeometryFields defaults={{
      shape: "circle",
      widthMm: 45,
      heightMm: 45,
      safeMarginMm: 2,
      bleedMm: 3
    }} />);

    expect(screen.getByLabelText(/Segurança · diâmetro absoluto/)).toHaveValue(45);
    expect(screen.getByLabelText(/Sangria · acréscimo por lado/)).toHaveValue(2);
    expect(screen.getByLabelText(/Corte · acréscimo por lado/)).toHaveValue(3);
    expect(screen.getByText("Valor absoluto calculado: 49 mm")).toBeInTheDocument();
    expect(screen.getByText("Valor absoluto calculado: 55 mm")).toBeInTheDocument();
    expect(hiddenValue(container, "printWidthMm")).toBe("45");
    expect(hiddenValue(container, "printSafeMarginMm")).toBe("2");
    expect(hiddenValue(container, "printBleedMm")).toBe("3");
  });

  it("recalculates the persisted sangria dimension from the safety size", () => {
    const { container } = render(<PrintGeometryFields />);

    fireEvent.change(screen.getByLabelText(/Segurança · diâmetro absoluto/), { target: { value: "41" } });
    expect(hiddenValue(container, "printWidthMm")).toBe("41");
    expect(screen.getByText("Sangria: 45 mm")).toBeInTheDocument();
    expect(screen.getByText("Corte: 49 mm")).toBeInTheDocument();
  });
});

function hiddenValue(container: HTMLElement, name: string) {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
}
