import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceArtworkOptions } from "@/components/commerce/CommerceArtworkOptions";
import { circularMockupPresets } from "@/domain/commerce/mockup-presets";
import { commerceArtworkOptionsSchema, defaultArtworkOptions, type CommerceArtworkOptions as Options } from "@/domain/commerce/artwork-options";
vi.mock("@/components/commerce/CommerceImageUpload", () => ({ CommerceImageUpload: () => null }));
const geometry = { shape: "circle" as const, widthMm: 55, heightMm: 55, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
afterEach(cleanup);
describe("circular product mockup presets", () => {
  it.each(["ima", "espelho", "abridor"])("applies %s without changing preparation, discounts or print measurements", (id) => {
    function Fixture() {
      const [value, setValue] = useState<Options>({ ...defaultArtworkOptions(), allowTeamPreparation: true, discountFixedCents: 200 });
      return <><CommerceArtworkOptions value={value} onChange={setValue} onBusyChange={vi.fn()} geometry={geometry} /><output data-testid="options">{JSON.stringify(value)}</output></>;
    }
    render(<Fixture />);
    fireEvent.click(screen.getByText("Preparação da arte, benefício e modelo do produto"));
    fireEvent.change(screen.getByLabelText("Modelo visual do produto"), { target: { value: id } });
    const preset = circularMockupPresets.find(p => p.id === id)!;
    fireEvent.click(screen.getByRole("button", { name: `Aplicar modelo ${preset.label}` }));
    const value = JSON.parse(screen.getByTestId("options").textContent!);
    expect(value).toMatchObject({ allowTeamPreparation: true, discountFixedCents: 200, mockup: preset.model });
    expect(geometry.widthMm).toBe(55);
    expect(screen.getByText(new RegExp(`Modelo ${preset.label} aplicado`))).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Baixar camadas PNG" })).toHaveAttribute("href", preset.downloadUrl);
  });
  it("reuses the same front, mask and rim and accepts only known local assets", () => {
    const original = circularMockupPresets[0].model;
    for (const preset of circularMockupPresets) {
      expect(preset.model.front).toEqual(original.front);
      expect(preset.model.back).toEqual({ ...original.back, baseUrl: preset.model.back.baseUrl });
      expect(preset.model.backOpeningRatio).toBe(original.backOpeningRatio);
      const options = { ...defaultArtworkOptions(), mockup: preset.model };
      expect(commerceArtworkOptionsSchema.safeParse(options).success).toBe(true);
      expect(commerceArtworkOptionsSchema.safeParse({ ...options, mockup: { ...preset.model, back: { ...preset.model.back, baseUrl: "/mockups/ima-redondo-v1/../private.png" } } }).success).toBe(false);
    }
    expect(circularMockupPresets).toHaveLength(4);
  });
  it("does not enable circular presets for a non-circular product", () => {
    const change = vi.fn();
    render(<CommerceArtworkOptions onChange={change} onBusyChange={vi.fn()} geometry={{ ...geometry, shape: "rectangle" }} />);
    fireEvent.click(screen.getByText("Preparação da arte, benefício e modelo do produto"));
    expect(screen.getByLabelText("Modelo visual do produto")).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });
});
