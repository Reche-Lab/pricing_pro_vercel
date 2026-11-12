import { calculatePrintGuideDimensions, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";
import type { StudioBackgroundImage } from "./studio-background";

export type StudioTextMode = "centered" | "circle" | "spiral";
export type StudioGradient = "solid" | "horizontal" | "diagonal" | "radial" | "spiral";
export type StudioFont = "modern" | "editorial" | "handwritten" | "bold";
export type StudioArtwork = { text: string; mode: StudioTextMode; font: StudioFont; textColor: string; colors: string[]; gradient: StudioGradient; backgroundType?: "color" | "image"; backgroundImage?: StudioBackgroundImage; showText?: boolean };
export type TextMeasure = (text: string, size: number) => number;
export type StudioTextBounds = { x: number; y: number; width: number; height: number };
export type StudioGlyph = { text: string; x: number; y: number; width: number; rotation: number };
export type StudioTextLayout = { fontSize: number; glyphs: StudioGlyph[]; truncated: boolean };

const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
const characters = (text: string) => Array.from(segmenter.segment(text), item => item.segment);

export function studioTextBounds(geometry: PrintGeometry, margins: PrintMargins, resolution: number): StudioTextBounds {
  const dimensions = calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
  const height = Math.round(resolution * dimensions.cutHeightMm / dimensions.cutWidthMm);
  const inset = .94 * (geometry.shape === "triangle" ? .45 : geometry.shape === "hexagon" ? .8 : 1);
  const width = resolution * geometry.widthMm / dimensions.cutWidthMm * inset;
  const safeHeight = height * geometry.heightMm / dimensions.cutHeightMm * inset;
  return { x: (resolution - width) / 2, y: (height - safeHeight) / 2, width, height: safeHeight };
}

function wrapText(text: string, widths: number[], size: number, measure: TextMeasure) {
  const paragraphs = text.split("\n").map(line => characters(line.trim()));
  const lines: string[] = [];
  let paragraph = 0, offset = 0;
  for (const width of widths) {
    if (paragraph >= paragraphs.length) break;
    const chars = paragraphs[paragraph];
    let end = offset;
    while (end < chars.length && measure(chars.slice(offset, end + 1).join(""), size) <= width) end++;
    if (end === offset && chars.length) return null;
    if (end < chars.length) {
      const space = chars.slice(offset, end).lastIndexOf(" ");
      if (space > 0) end = offset + space + 1;
    }
    lines.push(chars.slice(offset, end).join("").trim());
    offset = end;
    while (chars[offset] === " ") offset++;
    if (offset >= chars.length) { paragraph++; offset = 0; }
  }
  return paragraph === paragraphs.length ? lines : null;
}

function centered(text: string, bounds: StudioTextBounds, measure: TextMeasure): StudioTextLayout {
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  for (let size = Math.floor(Math.min(96, bounds.width * .28, bounds.height * .28)); size >= 12; size--) {
    for (let count = 1; count <= 12; count++) {
      const ys = Array.from({ length: count }, (_, index) => cy + (index - (count - 1) / 2) * size * 1.3);
      const widths = ys.map(y => {
        const edge = (Math.abs(y - cy) + size * .62) / (bounds.height / 2);
        return edge < 1 ? bounds.width * Math.sqrt(1 - edge * edge) * .97 : 0;
      });
      if (widths.some(width => width <= 0)) continue;
      const lines = wrapText(text, widths, size, measure);
      if (lines?.length !== count) continue;
      return { fontSize: size, truncated: false, glyphs: lines.map((line, index) => ({ text: line, x: cx, y: ys[index], width: measure(line, size), rotation: 0 })) };
    }
  }
  return { fontSize: 12, glyphs: [], truncated: true };
}

function circular(text: string, bounds: StudioTextBounds, measure: TextMeasure): StudioTextLayout {
  const chars = characters(text.replace(/\s+/g, " "));
  const radiusLimit = Math.min(bounds.width, bounds.height) / 2;
  for (let size = Math.floor(Math.min(64, radiusLimit * .33)); size >= 12; size--) {
    const radius = radiusLimit - size * .9;
    const advances = chars.map(char => measure(char, size) + size * .06);
    const length = advances.reduce((total, width) => total + width, 0);
    if (length > radius * Math.PI * 1.84) continue;
    let angle = -Math.PI / 2 - length / radius / 2;
    return { fontSize: size, truncated: false, glyphs: chars.map((char, index) => {
      const middle = angle + advances[index] / radius / 2;
      angle += advances[index] / radius;
      return { text: char, x: bounds.x + bounds.width / 2 + Math.cos(middle) * radius, y: bounds.y + bounds.height / 2 + Math.sin(middle) * radius, width: measure(char, size), rotation: middle + Math.PI / 2 };
    }) };
  }
  return { fontSize: 12, glyphs: [], truncated: true };
}

function spiral(text: string, bounds: StudioTextBounds, measure: TextMeasure): StudioTextLayout {
  const chars = characters(text.replace(/\s+/g, " "));
  const radiusLimit = Math.min(bounds.width, bounds.height) / 2;
  for (let size = Math.floor(Math.min(60, radiusLimit * .3)); size >= 12; size--) {
    const start = size * .9, growth = size * 1.6 / (2 * Math.PI), end = radiusLimit - size * .9;
    if (end <= start) continue;
    // Arc-length lookup avoids compressing the inner letters or letting turns collide.
    const points = [{ x: start, y: 0, angle: Math.atan2(start, growth), distance: 0 }];
    const limit = (end - start) / growth;
    for (let angle = .015; angle <= limit; angle += .015) {
      const radius = start + growth * angle, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      const previous = points[points.length - 1];
      points.push({ x, y, angle: Math.atan2(growth * Math.sin(angle) + radius * Math.cos(angle), growth * Math.cos(angle) - radius * Math.sin(angle)), distance: previous.distance + Math.hypot(x - previous.x, y - previous.y) });
    }
    const advances = chars.map(char => measure(char, size) + size * .08);
    if (advances.reduce((total, width) => total + width, 0) > points[points.length - 1].distance) continue;
    let distance = 0, index = 0;
    const glyphs = chars.map((char, charIndex) => {
      const middle = distance + advances[charIndex] / 2;
      distance += advances[charIndex];
      while (index < points.length - 1 && points[index].distance < middle) index++;
      const point = points[index];
      return { text: char, x: bounds.x + bounds.width / 2 + point.x, y: bounds.y + bounds.height / 2 + point.y, width: measure(char, size), rotation: point.angle };
    });
    return { fontSize: size, glyphs, truncated: false };
  }
  return { fontSize: 12, glyphs: [], truncated: true };
}

export function layoutStudioText({ text, mode, bounds, measure }: { text: string; mode: StudioTextMode; bounds: StudioTextBounds; measure: TextMeasure }): StudioTextLayout {
  const normalized = (text.normalize("NFC").trim() || "Sua ideia").slice(0, 160);
  if (bounds.width <= 0 || bounds.height <= 0) return { fontSize: 12, glyphs: [], truncated: true };
  return mode === "circle" ? circular(normalized, bounds, measure) : mode === "spiral" ? spiral(normalized, bounds, measure) : centered(normalized, bounds, measure);
}

export function studioGradientColor(colors: string[], position: number, cyclic = false): [number, number, number] {
  const palette = (colors.length ? colors.slice(0, 4) : ["#226d5c"]).map(color => /^#[a-f\d]{6}$/i.test(color) ? color : "#226d5c");
  const progress = Number.isFinite(position) ? cyclic ? ((position % 1) + 1) % 1 : Math.max(0, Math.min(1, position)) : 0;
  const part = progress * (cyclic ? palette.length : palette.length - 1);
  const index = Math.floor(part), next = cyclic ? (index + 1) % palette.length : Math.min(index + 1, palette.length - 1);
  return [1, 3, 5].map(offset => {
    const start = parseInt(palette[index].slice(offset, offset + 2), 16), end = parseInt(palette[next].slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * (part - index));
  }) as [number, number, number];
}
