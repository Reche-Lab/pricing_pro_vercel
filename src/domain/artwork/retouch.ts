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
  groupId?: string | null;
  selection?: RetouchSelection | null;
};
export type RetouchOutsideFill = {
  kind: "outside_fill";
  color: string;
  innerBounds: RetouchSelection;
};
export type RetouchOperation = RetouchStroke | RetouchFill | RetouchShape | RetouchOutsideFill;
export type RetouchLayerDirection = "front" | "forward" | "backward" | "back";
export type RetouchAdjustments = { brightness: number; contrast: number; saturation: number; sharpness: number };
export type RetouchComposition = {
  foregroundScalePercent: number;
  backgroundEnabled: boolean;
  backgroundExpansionMm: number;
  backgroundScalePercent: number;
  backgroundBlurPx: number;
};
export type RetouchDraft = {
  version: 1;
  operations: RetouchOperation[];
  adjustments: RetouchAdjustments;
  composition?: RetouchComposition;
};

export const DEFAULT_RETOUCH_ADJUSTMENTS: RetouchAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0
};

export const DEFAULT_RETOUCH_COMPOSITION: RetouchComposition = {
  foregroundScalePercent: 100,
  backgroundEnabled: false,
  backgroundExpansionMm: 3,
  backgroundScalePercent: 100,
  backgroundBlurPx: 0
};

export function calculateCenteredLayerBounds(input: {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  scalePercent: number;
  expansionPx?: number;
}) {
  const scale = Math.max(0.1, input.scalePercent / 100);
  const expansion = Math.max(0, input.expansionPx ?? 0);
  const width = input.sourceWidth * scale + expansion * 2;
  const height = input.sourceHeight * scale + expansion * 2;
  return { x: (input.canvasWidth - width) / 2, y: (input.canvasHeight - height) / 2, width, height };
}

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

export function retouchShapeGroupIndices(operations: RetouchOperation[], selectedIndex: number): number[] {
  const selected = operations[selectedIndex];
  if (selected?.kind !== "shape") return [];
  if (!selected.groupId) return [selectedIndex];
  return operations.flatMap((operation, index) => operation.kind === "shape" && operation.groupId === selected.groupId ? [index] : []);
}

export function calculateRetouchShapeGroupBounds(
  operations: RetouchOperation[],
  indices: number[]
): RetouchSelection | null {
  const shapes = indices
    .map((index) => operations[index])
    .filter((operation): operation is RetouchShape => operation?.kind === "shape")
    .map((shape) => normalizeSelection(shape.bounds));
  if (!shapes.length) return null;
  const left = Math.min(...shapes.map((bounds) => bounds.x));
  const top = Math.min(...shapes.map((bounds) => bounds.y));
  const right = Math.max(...shapes.map((bounds) => bounds.x + bounds.width));
  const bottom = Math.max(...shapes.map((bounds) => bounds.y + bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function assignRetouchShapeGroup(
  operations: RetouchOperation[],
  indices: number[],
  groupId: string
): RetouchOperation[] {
  const selected = new Set(indices);
  return operations.map((operation, index) => operation.kind === "shape" && selected.has(index)
    ? { ...operation, groupId }
    : operation);
}

export function ungroupRetouchShapes(operations: RetouchOperation[], groupId: string): RetouchOperation[] {
  return operations.map((operation) => operation.kind === "shape" && operation.groupId === groupId
    ? { ...operation, groupId: null }
    : operation);
}

export function moveRetouchShapeGroup(
  operations: RetouchOperation[],
  indices: number[],
  deltaX: number,
  deltaY: number
): RetouchOperation[] {
  const selected = new Set(indices);
  return operations.map((operation, index) => operation.kind === "shape" && selected.has(index)
    ? moveRetouchShape(operation, deltaX, deltaY)
    : operation);
}

export function resizeRetouchShapeGroup(
  operations: RetouchOperation[],
  indices: number[],
  handle: RetouchShapeHandle,
  point: RetouchPoint
): RetouchOperation[] {
  if (indices.length === 1) {
    const index = indices[0];
    const operation = operations[index];
    return operation?.kind === "shape" ? replaceAt(operations, index, resizeRetouchShape(operation, handle, point)) : operations;
  }
  const source = calculateRetouchShapeGroupBounds(operations, indices);
  if (!source || source.width <= 0 || source.height <= 0) return operations;
  const target = proportionalResizeBounds(source, handle, point);
  return scaleRetouchShapeGroupToBounds(operations, indices, source, target);
}

export function scaleRetouchShapeGroupToBounds(
  operations: RetouchOperation[],
  indices: number[],
  sourceBounds: RetouchSelection,
  targetBounds: RetouchSelection
): RetouchOperation[] {
  const source = normalizeSelection(sourceBounds);
  const target = normalizeSelection(targetBounds);
  if (source.width <= 0 || source.height <= 0) return operations;
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  const strokeScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
  const selected = new Set(indices);
  return operations.map((operation, index) => {
    if (operation.kind !== "shape" || !selected.has(index)) return operation;
    const bounds = normalizeSelection(operation.bounds);
    return {
      ...operation,
      width: Math.max(1, operation.width * strokeScale),
      bounds: {
        x: target.x + (bounds.x - source.x) * scaleX,
        y: target.y + (bounds.y - source.y) * scaleY,
        width: Math.max(2, bounds.width * scaleX),
        height: Math.max(2, bounds.height * scaleY)
      }
    };
  });
}

export function moveRetouchLayers(
  operations: RetouchOperation[],
  indices: number[],
  direction: RetouchLayerDirection
): RetouchOperation[] {
  const selected = new Set(indices);
  if (!selected.size) return operations;
  if (direction === "front" || direction === "back") {
    const moving = operations.filter((_, index) => selected.has(index));
    const remaining = operations.filter((_, index) => !selected.has(index));
    return direction === "front" ? [...remaining, ...moving] : [...moving, ...remaining];
  }

  const next = [...operations];
  if (direction === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(index) && !selected.has(index + 1)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        selected.delete(index); selected.add(index + 1);
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(index) && !selected.has(index - 1)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]];
        selected.delete(index); selected.add(index - 1);
      }
    }
  }
  return next;
}

function proportionalResizeBounds(bounds: RetouchSelection, handle: RetouchShapeHandle, point: RetouchPoint) {
  const opposite = {
    nw: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ne: { x: bounds.x, y: bounds.y + bounds.height },
    se: { x: bounds.x, y: bounds.y },
    sw: { x: bounds.x + bounds.width, y: bounds.y }
  }[handle];
  const scale = Math.max(
    Math.abs(point.x - opposite.x) / Math.max(1, bounds.width),
    Math.abs(point.y - opposite.y) / Math.max(1, bounds.height),
    2 / Math.max(1, Math.min(bounds.width, bounds.height))
  );
  const width = Math.max(2, bounds.width * scale);
  const height = Math.max(2, bounds.height * scale);
  return {
    x: handle === "nw" || handle === "sw" ? opposite.x - width : opposite.x,
    y: handle === "nw" || handle === "ne" ? opposite.y - height : opposite.y,
    width,
    height
  };
}

function replaceAt(operations: RetouchOperation[], index: number, operation: RetouchOperation) {
  return operations.map((current, currentIndex) => currentIndex === index ? operation : current);
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
