import { calculatePrintGuideDimensions, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";
import { layoutStudioText, studioGradientColor, studioTextBounds, type StudioArtwork, type StudioFont } from "@/domain/commerce/studio-artwork";

const fonts = {
  modern: { family: "Arial, sans-serif", weight: "700" },
  bold: { family: "Verdana, sans-serif", weight: "900" },
  editorial: { family: '"Studio Editorial", Georgia, serif', weight: "400", file: "/studio/fonts/dm-serif-display-latin.woff2", name: "Studio Editorial" },
  handwritten: { family: '"Studio Handwritten", cursive', weight: "700", file: "/studio/fonts/caveat-700-latin.woff2", name: "Studio Handwritten" },
};
const loading = new Map<StudioFont, Promise<void>>();
async function loadFont(font: StudioFont) {
  const definition = fonts[font];
  if (!("file" in definition)) return;
  if (!loading.has(font)) loading.set(font, (async () => {
    const face = await new FontFace(definition.name, `url("${definition.file}")`, { weight: definition.weight }).load();
    document.fonts.add(face);
  })().catch(error => { loading.delete(font); throw new Error("Não foi possível carregar esta fonte. Experimente outra e tente novamente.", { cause: error }); }));
  await loading.get(font);
}

function drawBackground(context: CanvasRenderingContext2D, settings: StudioArtwork, width: number, height: number) {
  const colors = settings.colors.slice(0, 4);
  if (colors.length < 2 || settings.gradient === "solid") {
    context.fillStyle = colors[0] || "#226d5c"; context.fillRect(0, 0, width, height); return;
  }
  if (settings.gradient === "spiral") {
    const sample = document.createElement("canvas"); sample.width = Math.max(1, Math.round(384 * Math.min(1, width / height))); sample.height = Math.max(1, Math.round(384 * Math.min(1, height / width)));
    const ctx = sample.getContext("2d")!;
    const image = ctx.createImageData(sample.width, sample.height), radius = Math.max(sample.width, sample.height) / 2;
    // A small color lookup keeps the spiral's per-pixel work bounded and independent of text quality.
    const palette = Array.from({ length: 1024 }, (_, index) => studioGradientColor(colors, index / 1024, true));
    for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
      const dx = x - sample.width / 2, dy = y - sample.height / 2;
      const phase = Math.atan2(dy, dx) / (2 * Math.PI) - Math.hypot(dx, dy) / radius * 1.2;
      const color = palette[Math.floor(((phase % 1 + 1) % 1) * 1024)];
      const at = (y * sample.width + x) * 4;
      image.data[at] = color[0]; image.data[at + 1] = color[1]; image.data[at + 2] = color[2]; image.data[at + 3] = 255;
    }
    ctx.putImageData(image, 0, 0); context.drawImage(sample, 0, 0, width, height); return;
  }
  const gradient = settings.gradient === "radial"
    ? context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2)
    : context.createLinearGradient(0, 0, width, settings.gradient === "diagonal" ? height : 0);
  colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
}

export async function renderStudioArtwork(settings: StudioArtwork, geometry: PrintGeometry, margins: PrintMargins) {
  await loadFont(settings.font);
  const dimensions = calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(640 * Math.min(1, dimensions.cutWidthMm / dimensions.cutHeightMm)));
  canvas.height = Math.max(1, Math.round(640 * Math.min(1, dimensions.cutHeightMm / dimensions.cutWidthMm)));
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível preparar a demonstração neste navegador.");
  drawBackground(ctx, settings, canvas.width, canvas.height);
  const font = fonts[settings.font];
  const setSize = (size: number) => { ctx.font = `${font.weight} ${size}px ${font.family}`; };
  const measurements = new Map<string, number>();
  const layout = layoutStudioText({ text: settings.text, mode: settings.mode, bounds: studioTextBounds(geometry, margins, canvas.width), measure: (text, size) => {
    const key = `${size}:${text}`;
    if (!measurements.has(key)) { setSize(size); measurements.set(key, ctx.measureText(text).width); }
    return measurements.get(key)!;
  } });
  setSize(layout.fontSize); ctx.fillStyle = settings.textColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const glyph of layout.glyphs) {
    ctx.save(); ctx.translate(glyph.x, glyph.y); ctx.rotate(glyph.rotation); ctx.fillText(glyph.text, 0, 0); ctx.restore();
  }
  return { dataUrl: canvas.toDataURL("image/png"), truncated: layout.truncated };
}
