// @vitest-environment node
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = postcss.parse(readFileSync(new URL("../../components/commerce/store.module.css", import.meta.url), "utf8"));
function tokens(selector: string) {
  const values: Record<string, string> = {};
  css.walkRules(selector, rule => { rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; }); });
  return values;
}
function contrast(first: string, second: string) {
  function luminance(hex: string) {
    const values = hex.replace("#", "").match(/.{2}/g)!.map(part => {
      const v = parseInt(part, 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
describe("light storefront palette", () => {
  it("keeps reading and price text legible on the toned page and white surfaces", () => {
    const light = tokens(".store");
    for (const background of [light["--page"], "#ffffff", light["--soft"], "#e4f0ee", "#e2ebef"])
      for (const foreground of [light["--ink"], light["--muted"], light["--highlight"]])
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
  it("provides distinct light surfaces and elevations without changing the dark palette", () => {
    const light = tokens(".store"), dark = tokens('.store[data-theme="dark"]');
    expect(light["--page"]).not.toBe(light["--surface"]);
    expect(light["--product-card-shadow"]).not.toBe("none");
    for (const component of ["header", "summary", "deliveryInquiry", "footer"])
      expect(tokens(`.store:not([data-theme="dark"]) .${component}`)["box-shadow"]).toMatch(/rgba\(/);
    expect(dark).toMatchObject({ "--page": "#0d1117", "--surface": "#151b23", "--soft": "#111821", "--ink": "#f3f6f9", "--muted": "#acb9c6", "--highlight": "#6fd0c9", "--product-card-shadow": "0 22px 60px -32px rgba(0, 0, 0, 0.85)" });
  });
});
