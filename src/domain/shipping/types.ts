export type PackagingBox = {
  id: string;
  name: string;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
  capacities?: Record<string, number>;
};

export type PackageSelectionItem = {
  variantId: string;
  quantity: number;
  unitWeightKg: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
};

export type PackageSelectionInput = {
  variantId?: string;
  quantity?: number;
  unitWeightKg?: number;
  widthCm?: number;
  lengthCm?: number;
  heightCm?: number;
  items?: PackageSelectionItem[];
  boxes: PackagingBox[];
  selectedBoxId?: string | null;
  splitByProduct?: boolean;
  clearanceCm?: number;
};

export type SelectedPackage = {
  box: PackagingBox;
  boxesNeeded: number;
  capacity: number;
  grossWeightKg: number;
  netWeightKg: number;
  grossWeightPerBoxKg: number;
  items?: Array<{
    variantId: string;
    quantity: number;
    boxesNeeded: number;
    capacity: number;
    orientation: {
      widthCm: number;
      lengthCm: number;
      heightCm: number;
    };
    layout: {
      perWidth: number;
      perLength: number;
      layers: number;
      perBox: number;
    };
  }>;
  alternatives?: Array<{
    box: PackagingBox;
    boxesNeeded: number;
    capacity: number;
    grossWeightKg: number;
    grossWeightPerBoxKg: number;
  }>;
};
