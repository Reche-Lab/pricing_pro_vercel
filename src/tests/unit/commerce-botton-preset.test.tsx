import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceArtworkOptions } from "@/components/commerce/CommerceArtworkOptions";
import { defaultArtworkOptions, type CommerceArtworkOptions as Options } from "@/domain/commerce/artwork-options";
vi.mock("@/components/commerce/CommerceImageUpload", () => ({ CommerceImageUpload: () => null }));
const geometry = { shape: "circle" as const, widthMm: 25, heightMm: 25, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
afterEach(cleanup);
describe("botton model quick configuration", () => {
  it("applies all six layers without changing the preparation or discount policy", () => {
    function Fixture() {
      const [value, setValue] = useState<Options>({ ...defaultArtworkOptions(), discountFixedCents: 150 });
      return <><CommerceArtworkOptions value={value} onChange={setValue} onBusyChange={vi.fn()} geometry={geometry} /><output data-testid="options">{JSON.stringify(value)}</output></>;
    }
    render(<Fixture />);
    fireEvent.click(screen.getByText("Preparação da arte, benefício e modelo do produto"));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar modelo Botton" }));
    const value = JSON.parse(screen.getByTestId("options").textContent!);
    expect(value.discountFixedCents).toBe(150);
    expect(value.allowTeamPreparation).toBe(false);
    expect(value.mockup.back.maskUrl).toContain("mascara-verso.png");
    expect(screen.getByText(/Modelo Botton aplicado/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Baixar camadas PNG" })).toHaveAttribute("download");
  });
  it("does not apply the circular template to non-circular products", () => {
    const change = vi.fn();
    render(<CommerceArtworkOptions onChange={change} onBusyChange={vi.fn()} geometry={{ ...geometry, shape: "square" }} />);
    fireEvent.click(screen.getByText("Preparação da arte, benefício e modelo do produto"));
    expect(screen.getByRole("button", { name: "Aplicar modelo Botton" })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });
});
