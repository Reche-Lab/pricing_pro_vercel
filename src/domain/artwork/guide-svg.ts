import { calculatePrintGuideDimensions, createPrintGuideLayout, PRINT_SHAPES, validatePrintMargins, type PrintGeometry, type PrintMargins } from "./geometry";

export const ARTWORK_GUIDE_MARKS = [
  { key: "safe", label: "Área de segurança", color: "#0891b2", dash: "1 0.8" },
  { key: "bleed", label: "Área visível da imagem / sangria", color: "#d97706", dash: "2 0.8" },
  { key: "cut", label: "Corte externo", color: "#e11d48", dash: "" }
] as const;

export function artworkGuideSizeLabel(widthMm: number, heightMm: number, circular: boolean) {
  const mm = (value: number) => Number(value.toFixed(3)).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return circular ? `Ø ${mm(widthMm)} mm` : `${mm(widthMm)} × ${mm(heightMm)} mm`;
}

export function createArtworkGuideSvg({ productName, geometry, margins }: {
  productName: string;
  geometry: PrintGeometry;
  margins: PrintMargins;
}) {
  const values = [geometry.widthMm, geometry.heightMm, geometry.cornerRadiusMm, geometry.rotationDegrees, margins.safeMarginMm, margins.bleedMm];
  if (!values.every(Number.isFinite) || geometry.cornerRadiusMm < 0 || !PRINT_SHAPES.includes(geometry.shape) || validatePrintMargins(geometry, margins)) {
    throw new Error("As medidas do guia da arte não estão configuradas corretamente.");
  }
  const dimensions = calculatePrintGuideDimensions({
    safeWidthMm: geometry.widthMm,
    safeHeightMm: geometry.heightMm,
    sangriaIncrementMm: margins.safeMarginMm,
    cutIncrementMm: margins.bleedMm
  });
  const layout = createPrintGuideLayout({ geometry, margins, viewportWidth: dimensions.cutWidthMm, viewportHeight: dimensions.cutHeightMm });
  const sizes = {
    safe: artworkGuideSizeLabel(dimensions.safeWidthMm, dimensions.safeHeightMm, geometry.shape === "circle"),
    bleed: artworkGuideSizeLabel(dimensions.sangriaWidthMm, dimensions.sangriaHeightMm, geometry.shape === "circle"),
    cut: artworkGuideSizeLabel(dimensions.cutWidthMm, dimensions.cutHeightMm, geometry.shape === "circle")
  };
  const number = (value: number) => String(Number(value.toFixed(3)));
  const width = number(dimensions.cutWidthMm);
  const height = number(dimensions.cutHeightMm);
  const description = `${ARTWORK_GUIDE_MARKS.map(mark => `${mark.label}: ${sizes[mark.key]}`).join("; ")}. Escala 1:1 em milímetros. Mantenha textos e elementos importantes dentro da segurança. A imagem fica visível até a sangria; continue o fundo até o corte externo. Oculte as marcações antes de exportar a arte final.`;
  const layers = [...ARTWORK_GUIDE_MARKS].reverse().map(mark => {
    const guide = layout[mark.key];
    const label = xml(`${mark.label} - ${sizes[mark.key]}`);
    return `  <g id="guia-${mark.key}" data-guide="${mark.key}" inkscape:groupmode="layer" inkscape:label="${label}" transform="translate(${number(guide.x)} ${number(guide.y)})">
    <title>${label}</title>
    <path d="${guide.path}" fill="none" stroke="${mark.color}" stroke-width="0.2"${mark.dash ? ` stroke-dasharray="${mark.dash}"` : ""}/>
  </g>`;
  }).join("\n");
  const name = productName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "produto";
  return {
    layout,
    dimensions,
    sizes,
    fileName: `guia-${name}-${width}x${height}mm.svg`,
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" overflow="visible" role="img" aria-labelledby="guia-titulo guia-descricao">
  <title id="guia-titulo">${xml(`Guia da arte - ${productName}`)}</title>
  <desc id="guia-descricao">${xml(description)}</desc>
${layers}
</svg>`
  };
}

function xml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
