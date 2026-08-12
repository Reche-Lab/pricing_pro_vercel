export function createRetouchedArtworkFileName(fileName: string, timestamp: number) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "arte";
  return `${base}-retoque-${timestamp}.webp`;
}

export function sampledRgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export type RetouchPoint = { x: number; y: number };
export type RetouchSelection = { x: number; y: number; width: number; height: number };
export type RetouchStroke = {
  kind: "stroke";
  tool: "brush" | "eraser";
  color: string;
  width: number;
  points: RetouchPoint[];
  selection?: RetouchSelection | null;
};
export type RetouchFill = {
  kind: "fill";
  point: RetouchPoint;
  color: string;
  tolerance: number;
  selection?: RetouchSelection | null;
};
export type RetouchShapeType = "circle" | "square" | "rectangle" | "triangle";
export type RetouchShapeHandle = "nw" | "ne" | "se" | "sw";
export type RetouchShape = {
  kind: "shape";
  shapeType: RetouchShapeType;
  bounds: RetouchSelection;
  color: string;
  width: number;
  selection?: RetouchSelection | null;
};
export type RetouchOperation = RetouchStroke | RetouchFill | RetouchShape;
export type RetouchAdjustments = { brightness: number; contrast: number; saturation: number; sharpness: number };
export type RetouchDraft = {
  version: 1;
  operations: RetouchOperation[];
  adjustments: RetouchAdjustments;
};

export const DEFAULT_RETOUCH_ADJUSTMENTS: RetouchAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0
};

export function findContiguousColorRegion(input: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  startX: number;
  startY: number;
  tolerance: number;
  selection?: RetouchSelection | null;
}) {
  const { pixels, width, height } = input;
  const mask = new Uint8Array(width * height);
  const startX = Math.max(0, Math.min(width - 1, Math.floor(input.startX)));
  const startY = Math.max(0, Math.min(height - 1, Math.floor(input.startY)));
  const bounds = selectionBounds(input.selection, width, height);
  if (startX < bounds.left || startX >= bounds.right || startY < bounds.top || startY >= bounds.bottom) return mask;
  const startOffset = (startY * width + startX) * 4;
  const target = [pixels[startOffset], pixels[startOffset + 1], pixels[startOffset + 2], pixels[startOffset + 3]];
  const stack = [startY * width + startX];
  while (stack.length) {
    const index = stack.pop() as number;
    const y = Math.floor(index / width);
    let x = index % width;
    if (mask[index] || !colorWithinTolerance(pixels, index * 4, target, input.tolerance)) continue;
    while (x > bounds.left && !mask[y * width + x - 1] && colorWithinTolerance(pixels, (y * width + x - 1) * 4, target, input.tolerance)) x -= 1;
    let spanAbove = false;
    let spanBelow = false;
    for (; x < bounds.right; x += 1) {
      const current = y * width + x;
      if (mask[current] || !colorWithinTolerance(pixels, current * 4, target, input.tolerance)) break;
      mask[current] = 1;
      if (y > bounds.top) {
        const above = current - width;
        const matches = !mask[above] && colorWithinTolerance(pixels, above * 4, target, input.tolerance);
        if (matches && !spanAbove) stack.push(above);
        spanAbove = matches;
      }
      if (y + 1 < bounds.bottom) {
        const below = current + width;
        const matches = !mask[below] && colorWithinTolerance(pixels, below * 4, target, input.tolerance);
        if (matches && !spanBelow) stack.push(below);
        spanBelow = matches;
      }
    }
  }
  return mask;
}

export function normalizeSelection(selection: RetouchSelection): RetouchSelection {
  return {
    x: selection.width < 0 ? selection.x + selection.width : selection.x,
    y: selection.height < 0 ? selection.y + selection.height : selection.y,
    width: Math.abs(selection.width),
    height: Math.abs(selection.height)
  };
}

export function createRetouchShape(input: {
  shapeType: RetouchShapeType;
  start: RetouchPoint;
  end: RetouchPoint;
  color: string;
  width: number;
  selection?: RetouchSelection | null;
}): RetouchShape {
  const width = input.end.x - input.start.x;
  const height = input.end.y - input.start.y;
  if (input.shapeType === "circle" || input.shapeType === "square") {
    const size = Math.max(Math.abs(width), Math.abs(height));
    return {
      kind: "shape", shapeType: input.shapeType, color: input.color, width: input.width, selection: input.selection,
      bounds: { x: width < 0 ? input.start.x - size : input.start.x, y: height < 0 ? input.start.y - size : input.start.y, width: size, height: size }
    };
  }
  return { kind: "shape", shapeType: input.shapeType, color: input.color, width: input.width, selection: input.selection, bounds: normalizeSelection({ x: input.start.x, y: input.start.y, width, height }) };
}

export function moveRetouchShape(shape: RetouchShape, deltaX: number, deltaY: number): RetouchShape {
  return { ...shape, bounds: { ...shape.bounds, x: shape.bounds.x + deltaX, y: shape.bounds.y + deltaY } };
}

export function resizeRetouchShape(shape: RetouchShape, handle: RetouchShapeHandle, point: RetouchPoint): RetouchShape {
  const bounds = normalizeSelection(shape.bounds);
  const opposite = {
    nw: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ne: { x: bounds.x, y: bounds.y + bounds.height },
    se: { x: bounds.x, y: bounds.y },
    sw: { x: bounds.x + bounds.width, y: bounds.y }
  }[handle];
  const resized = createRetouchShape({ shapeType: shape.shapeType, start: opposite, end: point, color: shape.color, width: shape.width, selection: shape.selection });
  return { ...resized, bounds: { ...resized.bounds, width: Math.max(2, resized.bounds.width), height: Math.max(2, resized.bounds.height) } };
}

function colorWithinTolerance(pixels: Uint8ClampedArray, offset: number, target: number[], tolerance: number) {
  const allowed = Math.max(0, Math.min(255, tolerance));
  return Math.max(
    Math.abs(pixels[offset] - target[0]),
    Math.abs(pixels[offset + 1] - target[1]),
    Math.abs(pixels[offset + 2] - target[2]),
    Math.abs(pixels[offset + 3] - target[3])
  ) <= allowed;
}

function selectionBounds(selection: RetouchSelection | null | undefined, width: number, height: number) {
  if (!selection) return { left: 0, top: 0, right: width, bottom: height };
  const normalized = normalizeSelection(selection);
  return {
    left: Math.max(0, Math.floor(normalized.x)),
    top: Math.max(0, Math.floor(normalized.y)),
    right: Math.min(width, Math.ceil(normalized.x + normalized.width)),
    bottom: Math.min(height, Math.ceil(normalized.y + normalized.height))
  };
}
