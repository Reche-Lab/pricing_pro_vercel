import { describe, expect, it } from "vitest";
import { applyCarrierMinimums, selectBestPackage } from "@/domain/shipping/packaging";
import type { PackagingBox } from "@/domain/shipping/types";

const boxes: PackagingBox[] = [
  {
    id: "small",
    name: "4x11x17",
    heightCm: 4,
    widthCm: 11,
    lengthCm: 17,
    weightKg: 0.03,
    capacities: {}
  },
  {
    id: "medium",
    name: "8x14x21",
    heightCm: 8,
    widthCm: 14,
    lengthCm: 21,
    weightKg: 0.057,
    capacities: {}
  }
];

describe("packaging domain", () => {
  it("selects the smallest box that fits the quantity", () => {
    const selected = selectBestPackage({
      variantId: "button-25",
      quantity: 100,
      unitWeightKg: 0.004,
      heightCm: 0.5,
      widthCm: 2.5,
      lengthCm: 2.5,
      clearanceCm: 0,
      boxes
    });

    expect(selected?.box.id).toBe("small");
    expect(selected?.boxesNeeded).toBe(1);
    expect(selected?.grossWeightKg).toBeCloseTo(0.43, 4);
  });

  it("uses the highest capacity box and splits quantity when no single box fits", () => {
    const selected = selectBestPackage({
      variantId: "button-25",
      quantity: 900,
      unitWeightKg: 0.004,
      heightCm: 0.5,
      widthCm: 2.5,
      lengthCm: 2.5,
      clearanceCm: 0,
      boxes
    });

    expect(selected?.box.id).toBe("medium");
    expect(selected?.boxesNeeded).toBe(2);
    expect(selected?.grossWeightKg).toBeCloseTo(3.714, 4);
  });

  it("rotates the product to fit a compatible box", () => {
    const selected = selectBestPackage({
      variantId: "rotated",
      quantity: 1,
      unitWeightKg: 0.1,
      heightCm: 8,
      widthCm: 4,
      lengthCm: 10,
      clearanceCm: 0,
      boxes: [
        {
          id: "flat",
          name: "10x5x8",
          heightCm: 10,
          widthCm: 5,
          lengthCm: 8,
          weightKg: 0.02,
          capacities: {}
        }
      ]
    });

    expect(selected?.box.id).toBe("flat");
    expect(selected?.capacity).toBe(1);
  });

  it("returns alternatives for manual box selection", () => {
    const selected = selectBestPackage({
      variantId: "button-25",
      quantity: 50,
      unitWeightKg: 0.004,
      heightCm: 0.5,
      widthCm: 2.5,
      lengthCm: 2.5,
      clearanceCm: 0,
      boxes
    });

    expect(selected?.alternatives?.[0].box.id).toBe("medium");
  });

  it("applies carrier minimum dimensions", () => {
    expect(
      applyCarrierMinimums({
        id: "tiny",
        name: "tiny",
        heightCm: 1,
        widthCm: 5,
        lengthCm: 8,
        weightKg: 0.01,
        capacities: {}
      })
    ).toEqual({ heightCm: 2, widthCm: 11, lengthCm: 16 });
  });
});
