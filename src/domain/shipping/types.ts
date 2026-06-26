export type PackagingBox = {
  id: string;
  name: string;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
  capacities: Record<string, number>;
};

export type PackageSelectionInput = {
  variantId: string;
  quantity: number;
  unitWeightKg: number;
  boxes: PackagingBox[];
};

export type SelectedPackage = {
  box: PackagingBox;
  boxesNeeded: number;
  capacity: number;
  grossWeightKg: number;
  netWeightKg: number;
  grossWeightPerBoxKg: number;
};
