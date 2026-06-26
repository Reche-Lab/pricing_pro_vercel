import type { PackageSelectionInput, PackagingBox, SelectedPackage } from "./types";

export function selectBestPackage(input: PackageSelectionInput): SelectedPackage | null {
  const quantity = Math.max(1, Math.trunc(input.quantity));
  const candidates = input.boxes
    .map((box) => ({ box, capacity: box.capacities[input.variantId] ?? 0 }))
    .filter((candidate) => candidate.capacity > 0);

  if (candidates.length === 0) return null;

  const singleBox = candidates
    .filter((candidate) => candidate.capacity >= quantity)
    .sort((a, b) => boxArea(a.box) - boxArea(b.box))[0];

  const selected =
    singleBox ??
    candidates.sort((a, b) => {
      if (b.capacity !== a.capacity) return b.capacity - a.capacity;
      return boxArea(a.box) - boxArea(b.box);
    })[0];

  const boxesNeeded = Math.max(1, Math.ceil(quantity / selected.capacity));
  const netWeightKg = input.unitWeightKg * quantity;
  const grossWeightKg = netWeightKg + selected.box.weightKg * boxesNeeded;

  return {
    box: selected.box,
    boxesNeeded,
    capacity: selected.capacity,
    netWeightKg,
    grossWeightKg,
    grossWeightPerBoxKg: grossWeightKg / boxesNeeded
  };
}

export function boxArea(box: Pick<PackagingBox, "heightCm" | "widthCm" | "lengthCm">): number {
  return box.heightCm * box.widthCm * box.lengthCm;
}

export function applyCarrierMinimums(box: PackagingBox) {
  return {
    heightCm: Math.max(2, box.heightCm),
    widthCm: Math.max(11, box.widthCm),
    lengthCm: Math.max(16, box.lengthCm)
  };
}
