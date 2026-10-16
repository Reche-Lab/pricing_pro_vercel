import { describe, expect, it } from "vitest";
import { createArtworkGuideSvg } from "@/domain/artwork/guide-svg";
import { createPrintGuideLayout, type PrintGeometry } from "@/domain/artwork/geometry";

const circle: PrintGeometry = { shape: "circle", widthMm: 53, heightMm: 53, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");

describe("downloadable product artwork guide", () => {
  it("exports absolute physical sizes with a transparent canvas and three named layers", () => {
    const result = createArtworkGuideSvg({ productName: "Botton - 5,5 cm", geometry: circle, margins: { safeMarginMm: 1.5, bleedMm: 2 } });
    const doc = parse(result.svg);
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.getAttribute("width")).toBe("60mm");
    expect(doc.documentElement.getAttribute("height")).toBe("60mm");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 60 60");
    expect(result.dimensions).toMatchObject({ safeWidthMm: 53, sangriaWidthMm: 56, cutWidthMm: 60 });
    expect(doc.querySelectorAll("g[data-guide]")).toHaveLength(3);
    expect(doc.querySelectorAll("path[fill='none']")).toHaveLength(3);
    expect(doc.querySelector("rect, image, script, foreignObject")).toBeNull();
    expect(doc.querySelector("desc")?.textContent).toContain("53 mm");
    expect(doc.querySelector("desc")?.textContent).toContain("56 mm");
    expect(doc.querySelector("desc")?.textContent).toContain("60 mm");
    expect(result.fileName).toBe("guia-botton-5-5-cm-60x60mm.svg");
  });

  it.each(["circle", "square", "rectangle", "triangle", "hexagon"] as const)("matches the existing framing and production paths for %s", shape => {
    const geometry = { ...circle, shape, widthMm: 80, heightMm: shape === "rectangle" || shape === "triangle" || shape === "hexagon" ? 50 : 80, cornerStyle: "rounded" as const, cornerRadiusMm: 4, rotationDegrees: 25 };
    const margins = { safeMarginMm: 2, bleedMm: 3 };
    const result = createArtworkGuideSvg({ productName: "Produto", geometry, margins });
    const guides = createPrintGuideLayout({ geometry, margins, viewportWidth: result.dimensions.cutWidthMm, viewportHeight: result.dimensions.cutHeightMm });
    const doc = parse(result.svg);
    for (const guide of ["cut", "bleed", "safe"] as const) {
      const group = doc.querySelector(`g[data-guide='${guide}']`)!;
      expect(group.querySelector("path")?.getAttribute("d")).toBe(guides[guide].path);
      expect(group.getAttribute("transform")).toBe(`translate(${guides[guide].x} ${guides[guide].y})`);
      expect(group.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "groupmode")).toBe("layer");
    }
  });

  it("preserves fractional dimensions and zero margins without introducing extra padding", () => {
    const result = createArtworkGuideSvg({ productName: "Produto", geometry: { ...circle, widthMm: 25.75, heightMm: 25.75 }, margins: { safeMarginMm: 0, bleedMm: 0 } });
    expect(parse(result.svg).documentElement.getAttribute("width")).toBe("25.75mm");
    expect(parse(result.svg).documentElement.getAttribute("viewBox")).toBe("0 0 25.75 25.75");
  });

  it("escapes product text and sanitizes the download filename", () => {
    const productName = 'Arte & <script onload="alert(1)">/São Paulo';
    const result = createArtworkGuideSvg({ productName, geometry: circle, margins: { safeMarginMm: 1, bleedMm: 2 } });
    const doc = parse(result.svg);
    expect(doc.querySelector("parsererror, script, [onload], foreignObject, image")).toBeNull();
    expect(doc.querySelector("title")?.textContent).toContain(productName);
    expect(result.fileName).toMatch(/^[a-z0-9-]+-\d+x\d+mm\.svg$/);
  });

  it("refuses nonfinite or invalid physical measurements", () => {
    for (const widthMm of [0, -1, NaN, Infinity]) {
      expect(() => createArtworkGuideSvg({ productName: "Produto", geometry: { ...circle, widthMm }, margins: { safeMarginMm: 1, bleedMm: 2 } })).toThrow();
    }
    for (const bleedMm of [-1, NaN, Infinity]) {
      expect(() => createArtworkGuideSvg({ productName: "Produto", geometry: circle, margins: { safeMarginMm: 1, bleedMm } })).toThrow();
    }
  });
});
