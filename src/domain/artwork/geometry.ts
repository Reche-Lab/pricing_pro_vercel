export const PRINT_SHAPES = ["circle", "square", "rectangle", "triangle", "hexagon"] as const;
export type PrintShape = (typeof PRINT_SHAPES)[number];
export type PrintCornerStyle = "sharp" | "rounded";

export type PrintGeometry = {
  shape: PrintShape;
  widthMm: number;
  heightMm: number;
  cornerStyle: PrintCornerStyle;
  cornerRadiusMm: number;
  rotationDegrees: number;
  allowPrintRotation: boolean;
};

export type PrintMargins = {
  bleedMm: number;
  safeMarginMm: number;
};

export type PrintGuideLayout = {
  outer: { x: number; y: number; width: number; height: number; path: string };
  cut: { x: number; y: number; width: number; height: number; path: string };
  safe: { x: number; y: number; width: number; height: number; path: string };
  unitsPerMm: number;
  outputWidthMm: number;
  outputHeightMm: number;
  safeWidthMm: number;
  safeHeightMm: number;
};

type GeometrySource = {
  target_shape?: string | null;
  target_width_mm?: string | number | null;
  target_height_mm?: string | number | null;
  target_corner_style?: string | null;
  target_corner_radius_mm?: string | number | null;
  target_shape_rotation_degrees?: string | number | null;
  target_allow_print_rotation?: boolean | null;
  target_diameter_mm?: string | number | null;
  print_shape?: string | null;
  print_width_mm?: string | number | null;
  print_height_mm?: string | number | null;
  print_corner_style?: string | null;
  print_corner_radius_mm?: string | number | null;
  print_shape_rotation_degrees?: string | number | null;
  allow_print_rotation?: boolean | null;
  print_diameter_mm?: string | number | null;
  print_bleed_mm?: string | number | null;
  print_safe_margin_mm?: string | number | null;
  bleed_mm?: string | number | null;
  safe_margin_mm?: string | number | null;
  width_cm?: string | number | null;
  length_cm?: string | number | null;
};

export function resolvePrintMargins(source: GeometrySource, fallback: PrintMargins = { bleedMm: 2, safeMarginMm: 2 }): PrintMargins {
  return {
    bleedMm: nonNegative(source.bleed_mm) ?? nonNegative(source.print_bleed_mm) ?? fallback.bleedMm,
    safeMarginMm: nonNegative(source.safe_margin_mm) ?? nonNegative(source.print_safe_margin_mm) ?? fallback.safeMarginMm
  };
}

export function validatePrintMargins(geometry: PrintGeometry, margins: PrintMargins) {
  if (margins.bleedMm < 0 || margins.bleedMm > 50) return "A sangria deve estar entre 0 e 50 mm.";
  if (margins.safeMarginMm < 0 || margins.safeMarginMm > 50) return "A margem de segurança deve estar entre 0 e 50 mm.";
  if (margins.safeMarginMm * 2 >= Math.min(geometry.widthMm, geometry.heightMm)) {
    return "A margem de segurança precisa deixar uma área útil no interior do corte.";
  }
  return null;
}

export function resolvePrintGeometry(source: GeometrySource): PrintGeometry | null {
  const legacyDiameter = positive(source.target_diameter_mm) || positive(source.print_diameter_mm);
  let widthMm = positive(source.target_width_mm) || positive(source.print_width_mm) || legacyDiameter;
  let heightMm = positive(source.target_height_mm) || positive(source.print_height_mm) || legacyDiameter;
  if (!widthMm || !heightMm) {
    const packageMm = Math.max(positive(source.width_cm), positive(source.length_cm)) * 10;
    widthMm ||= packageMm;
    heightMm ||= packageMm;
  }
  if (!widthMm || !heightMm) return null;
  const shape = normalizeShape(source.target_shape || source.print_shape);
  if (shape === "circle" || shape === "square") heightMm = widthMm;
  const cornerStyle = (source.target_corner_style || source.print_corner_style) === "rounded" ? "rounded" : "sharp";
  const maxRadius = Math.min(widthMm, heightMm) / 2;
  const cornerRadiusMm = cornerStyle === "rounded"
    ? Math.min(maxRadius, Math.max(0, Number(source.target_corner_radius_mm ?? source.print_corner_radius_mm ?? 0)))
    : 0;
  return {
    shape,
    widthMm,
    heightMm,
    cornerStyle,
    cornerRadiusMm,
    rotationDegrees: clamp(Number(source.target_shape_rotation_degrees ?? source.print_shape_rotation_degrees ?? 0), -180, 180),
    allowPrintRotation: source.target_allow_print_rotation ?? source.allow_print_rotation ?? true
  };
}

export function geometryLabel(geometry: PrintGeometry) {
  const labels: Record<PrintShape, string> = { circle: "Circular", square: "Quadrado", rectangle: "Retangular", triangle: "Triangular", hexagon: "Hexagonal" };
  return `${labels[geometry.shape]} ${formatMm(geometry.widthMm)} × ${formatMm(geometry.heightMm)} mm`;
}

export function createShapePath(input: {
  shape: PrintShape;
  width: number;
  height: number;
  cornerRadius?: number;
  rotationDegrees?: number;
  inset?: number;
}) {
  const inset = Math.max(0, input.inset ?? 0);
  const width = Math.max(1, input.width - inset * 2);
  const height = Math.max(1, input.height - inset * 2);
  const x = inset;
  const y = inset;
  const radius = Math.max(0, input.cornerRadius ?? 0);
  if (input.shape === "circle") return ellipsePath(x, y, width, height);
  if (input.shape === "square" || input.shape === "rectangle") return roundedRectPath(x, y, width, height, radius);
  const count = input.shape === "triangle" ? 3 : 6;
  const points = regularPolygonPoints(count, x + width / 2, y + height / 2, width / 2, height / 2, input.rotationDegrees ?? 0);
  return roundedPolygonPath(points, radius);
}

export function createPrintGuideLayout(input: {
  geometry: PrintGeometry;
  margins: PrintMargins;
  viewportWidth: number;
  viewportHeight: number;
  paddingRatio?: number;
}): PrintGuideLayout {
  const { geometry, margins } = input;
  const outputWidthMm = geometry.widthMm + margins.bleedMm * 2;
  const outputHeightMm = geometry.heightMm + margins.bleedMm * 2;
  const padding = clamp(input.paddingRatio ?? 0, 0, 0.4);
  const availableWidth = input.viewportWidth * (1 - padding * 2);
  const availableHeight = input.viewportHeight * (1 - padding * 2);
  const unitsPerMm = Math.min(availableWidth / outputWidthMm, availableHeight / outputHeightMm);
  const outerWidth = outputWidthMm * unitsPerMm;
  const outerHeight = outputHeightMm * unitsPerMm;
  const x = (input.viewportWidth - outerWidth) / 2;
  const y = (input.viewportHeight - outerHeight) / 2;
  const bleedInset = margins.bleedMm * unitsPerMm;
  const safeInset = (margins.bleedMm + margins.safeMarginMm) * unitsPerMm;
  const shapePath = (inset: number, cornerRadiusMm: number) => createShapePath({
    shape: geometry.shape,
    width: outerWidth,
    height: outerHeight,
    cornerRadius: Math.max(0, cornerRadiusMm) * unitsPerMm,
    rotationDegrees: geometry.rotationDegrees,
    inset
  });
  return {
    outer: { x, y, width: outerWidth, height: outerHeight, path: shapePath(0, geometry.cornerRadiusMm + margins.bleedMm) },
    cut: { x, y, width: outerWidth, height: outerHeight, path: shapePath(bleedInset, geometry.cornerRadiusMm) },
    safe: { x, y, width: outerWidth, height: outerHeight, path: shapePath(safeInset, geometry.cornerRadiusMm - margins.safeMarginMm) },
    unitsPerMm,
    outputWidthMm,
    outputHeightMm,
    safeWidthMm: Math.max(0, geometry.widthMm - margins.safeMarginMm * 2),
    safeHeightMm: Math.max(0, geometry.heightMm - margins.safeMarginMm * 2)
  };
}

export function createShapeSvg(input: {
  shape: PrintShape;
  width: number;
  height: number;
  cornerRadius?: number;
  rotationDegrees?: number;
  inset?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const path = createShapePath(input);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><path d="${path}" fill="${input.fill ?? "white"}"${input.stroke ? ` stroke="${input.stroke}" stroke-width="${input.strokeWidth ?? 1}"` : ""}/></svg>`;
}

function normalizeShape(value: string | null | undefined): PrintShape {
  return PRINT_SHAPES.includes(value as PrintShape) ? value as PrintShape : "circle";
}

function regularPolygonPoints(count: number, cx: number, cy: number, rx: number, ry: number, rotationDegrees: number) {
  const start = -90 + rotationDegrees;
  return Array.from({ length: count }, (_, index) => {
    const angle = (start + index * 360 / count) * Math.PI / 180;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function roundedPolygonPath(points: Array<{ x: number; y: number }>, requestedRadius: number) {
  const entries = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const radius = Math.min(requestedRadius, distance(previous, point) / 2, distance(point, next) / 2);
    return { point, start: toward(point, previous, radius), end: toward(point, next, radius) };
  });
  const commands = entries.flatMap((entry, index) => {
    const next = entries[(index + 1) % entries.length];
    return [`Q ${n(entry.point.x)} ${n(entry.point.y)} ${n(entry.end.x)} ${n(entry.end.y)}`, `L ${n(next.start.x)} ${n(next.start.y)}`];
  });
  return `${move(entries[0].start)} ${commands.join(" ")} Z`;
}

function roundedRectPath(x: number, y: number, width: number, height: number, requestedRadius: number) {
  const r = Math.min(requestedRadius, width / 2, height / 2);
  if (!r) return `M ${n(x)} ${n(y)} H ${n(x + width)} V ${n(y + height)} H ${n(x)} Z`;
  return `M ${n(x + r)} ${n(y)} H ${n(x + width - r)} Q ${n(x + width)} ${n(y)} ${n(x + width)} ${n(y + r)} V ${n(y + height - r)} Q ${n(x + width)} ${n(y + height)} ${n(x + width - r)} ${n(y + height)} H ${n(x + r)} Q ${n(x)} ${n(y + height)} ${n(x)} ${n(y + height - r)} V ${n(y + r)} Q ${n(x)} ${n(y)} ${n(x + r)} ${n(y)} Z`;
}

function ellipsePath(x: number, y: number, width: number, height: number) {
  const rx = width / 2; const ry = height / 2; const cx = x + rx; const cy = y + ry;
  return `M ${n(cx - rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`;
}

function toward(from: { x: number; y: number }, to: { x: number; y: number }, amount: number) {
  const length = distance(from, to) || 1;
  return { x: from.x + (to.x - from.x) * amount / length, y: from.y + (to.y - from.y) * amount / length };
}
function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
function move(point: { x: number; y: number }) { return `M ${n(point.x)} ${n(point.y)}`; }
function n(value: number) { return Number(value.toFixed(3)); }
function positive(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; }
function nonNegative(value: unknown) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0)); }
function formatMm(value: number) { return Number(value.toFixed(2)).toLocaleString("pt-BR"); }
