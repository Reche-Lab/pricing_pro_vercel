import type { PackageSelectionInput, PackageSelectionItem, PackagingBox, SelectedPackage } from "./types";

const DEFAULT_CLEARANCE_CM = 0.3;
const MIXED_PACKING_EFFICIENCY = 0.82;

type BoxFit = {
  box: PackagingBox;
  boxesNeeded: number;
  capacity: number;
  netWeightKg: number;
  grossWeightKg: number;
  grossWeightPerBoxKg: number;
  items: NonNullable<SelectedPackage["items"]>;
};

type ItemFit = NonNullable<SelectedPackage["items"]>[number];

export function selectBestPackage(input: PackageSelectionInput): SelectedPackage | null {
  const items = normalizeItems(input);
  if (items.length === 0) return null;

  const boxes = input.selectedBoxId
    ? input.boxes.filter((box) => box.id === input.selectedBoxId)
    : input.boxes;
  if (boxes.length === 0) return null;

  if (input.splitByProduct && items.length > 1) {
    return selectSplitPackage({ ...input, items, boxes });
  }

  const clearanceCm = clampClearance(input.clearanceCm);
  const candidates = boxes
    .map((box) => estimateBoxFit(box, items, clearanceCm))
    .filter((candidate): candidate is BoxFit => Boolean(candidate))
    .sort(compareBoxFits);

  const selected = candidates[0];
  if (!selected) return null;

  return {
    box: selected.box,
    boxesNeeded: selected.boxesNeeded,
    capacity: selected.capacity,
    netWeightKg: selected.netWeightKg,
    grossWeightKg: selected.grossWeightKg,
    grossWeightPerBoxKg: selected.grossWeightPerBoxKg,
    items: selected.items,
    alternatives: candidates.slice(1, 5).map((candidate) => ({
      box: candidate.box,
      boxesNeeded: candidate.boxesNeeded,
      capacity: candidate.capacity,
      grossWeightKg: candidate.grossWeightKg,
      grossWeightPerBoxKg: candidate.grossWeightPerBoxKg
    }))
  };
}

function selectSplitPackage(input: PackageSelectionInput & { items: PackageSelectionItem[] }): SelectedPackage | null {
  const perItem = input.items
    .map((item) =>
      selectBestPackage({
        ...input,
        items: [item],
        splitByProduct: false
      })
    )
    .filter((selection): selection is SelectedPackage => Boolean(selection));

  if (perItem.length !== input.items.length) return null;

  const biggest = [...perItem].sort((a, b) => boxVolume(b.box) - boxVolume(a.box))[0];
  const boxesNeeded = perItem.reduce((sum, item) => sum + item.boxesNeeded, 0);
  const netWeightKg = perItem.reduce((sum, item) => sum + item.netWeightKg, 0);
  const grossWeightKg = perItem.reduce((sum, item) => sum + item.grossWeightKg, 0);

  return {
    box: biggest.box,
    boxesNeeded,
    capacity: perItem.reduce((sum, item) => sum + item.capacity, 0),
    netWeightKg,
    grossWeightKg,
    grossWeightPerBoxKg: grossWeightKg / boxesNeeded,
    items: perItem.flatMap((item) => item.items ?? []),
    alternatives: []
  };
}

function estimateBoxFit(box: PackagingBox, items: PackageSelectionItem[], clearanceCm: number): BoxFit | null {
  const itemFits: ItemFit[] = [];
  let fillRatio = 0;
  let capacity = 0;
  let netWeightKg = 0;

  for (const item of items) {
    const fit = estimateItemFit(box, item, clearanceCm);
    if (!fit) return null;
    itemFits.push(fit);
    fillRatio += fit.quantity / fit.capacity;
    capacity += fit.capacity;
    netWeightKg += item.unitWeightKg * fit.quantity;
  }

  const boxesNeeded =
    items.length === 1
      ? Math.ceil(itemFits[0].quantity / itemFits[0].capacity)
      : Math.ceil(fillRatio / MIXED_PACKING_EFFICIENCY);
  const safeBoxesNeeded = Math.max(1, boxesNeeded);
  const grossWeightKg = netWeightKg + box.weightKg * safeBoxesNeeded;

  return {
    box,
    boxesNeeded: safeBoxesNeeded,
    capacity,
    netWeightKg,
    grossWeightKg,
    grossWeightPerBoxKg: grossWeightKg / safeBoxesNeeded,
    items: itemFits
  };
}

function estimateItemFit(box: PackagingBox, item: PackageSelectionItem, clearanceCm: number): ItemFit | null {
  const orientations = uniqueOrientations(item).map((orientation) => ({
    widthCm: orientation.widthCm + clearanceCm,
    lengthCm: orientation.lengthCm + clearanceCm,
    heightCm: orientation.heightCm + clearanceCm,
    raw: orientation
  }));

  const candidates = orientations
    .map((orientation) => {
      const perWidth = Math.floor(box.widthCm / orientation.widthCm);
      const perLength = Math.floor(box.lengthCm / orientation.lengthCm);
      const layers = Math.floor(box.heightCm / orientation.heightCm);
      const perBox = perWidth * perLength * layers;
      if (perBox <= 0) return null;

      return {
        variantId: item.variantId,
        quantity: Math.max(1, Math.trunc(item.quantity)),
        boxesNeeded: Math.ceil(item.quantity / perBox),
        capacity: perBox,
        orientation: orientation.raw,
        layout: {
          perWidth,
          perLength,
          layers,
          perBox
        }
      };
    })
    .filter((candidate): candidate is ItemFit => Boolean(candidate))
    .sort((a, b) => {
      if (b.capacity !== a.capacity) return b.capacity - a.capacity;
      return a.boxesNeeded - b.boxesNeeded;
    });

  return candidates[0] ?? null;
}

function normalizeItems(input: PackageSelectionInput): PackageSelectionItem[] {
  if (input.items?.length) {
    return input.items
      .map((item) => ({
        ...item,
        quantity: Math.max(1, Math.trunc(item.quantity)),
        unitWeightKg: Math.max(0, item.unitWeightKg),
        widthCm: Math.max(0, item.widthCm),
        lengthCm: Math.max(0, item.lengthCm),
        heightCm: Math.max(0, item.heightCm)
      }))
      .filter((item) => item.widthCm > 0 && item.lengthCm > 0 && item.heightCm > 0);
  }

  if (
    !input.variantId ||
    !input.quantity ||
    input.unitWeightKg === undefined ||
    !input.widthCm ||
    !input.lengthCm ||
    !input.heightCm
  ) {
    return [];
  }

  return [
    {
      variantId: input.variantId,
      quantity: Math.max(1, Math.trunc(input.quantity)),
      unitWeightKg: Math.max(0, input.unitWeightKg),
      widthCm: Math.max(0, input.widthCm),
      lengthCm: Math.max(0, input.lengthCm),
      heightCm: Math.max(0, input.heightCm)
    }
  ];
}

function uniqueOrientations(item: Pick<PackageSelectionItem, "widthCm" | "lengthCm" | "heightCm">) {
  const dimensions = [item.widthCm, item.lengthCm, item.heightCm];
  const permutations = [
    [dimensions[0], dimensions[1], dimensions[2]],
    [dimensions[0], dimensions[2], dimensions[1]],
    [dimensions[1], dimensions[0], dimensions[2]],
    [dimensions[1], dimensions[2], dimensions[0]],
    [dimensions[2], dimensions[0], dimensions[1]],
    [dimensions[2], dimensions[1], dimensions[0]]
  ];
  const seen = new Set<string>();

  return permutations
    .map(([widthCm, lengthCm, heightCm]) => ({ widthCm, lengthCm, heightCm }))
    .filter((orientation) => {
      const key = `${orientation.widthCm}:${orientation.lengthCm}:${orientation.heightCm}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function compareBoxFits(a: BoxFit, b: BoxFit) {
  if (a.boxesNeeded !== b.boxesNeeded) return a.boxesNeeded - b.boxesNeeded;
  if (boxVolume(a.box) !== boxVolume(b.box)) return boxVolume(a.box) - boxVolume(b.box);
  return a.grossWeightKg - b.grossWeightKg;
}

export function boxArea(box: Pick<PackagingBox, "heightCm" | "widthCm" | "lengthCm">): number {
  return boxVolume(box);
}

function boxVolume(box: Pick<PackagingBox, "heightCm" | "widthCm" | "lengthCm">): number {
  return box.heightCm * box.widthCm * box.lengthCm;
}

function clampClearance(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_CLEARANCE_CM;
  return Math.max(0, Math.min(5, Number(value)));
}

export function applyCarrierMinimums(box: PackagingBox) {
  return {
    heightCm: Math.max(2, box.heightCm),
    widthCm: Math.max(11, box.widthCm),
    lengthCm: Math.max(16, box.lengthCm)
  };
}
