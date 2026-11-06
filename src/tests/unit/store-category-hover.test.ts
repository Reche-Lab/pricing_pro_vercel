// @vitest-environment node
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

describe("storefront category hover space", () => {
  it("reserves room above images for the lift and scale inside the scrolling rail", () => {
    const css = postcss.parse(readFileSync(new URL("../../components/commerce/store.module.css", import.meta.url), "utf8"));
    let paddingTop = 0, imageHeight = 0, lift = 0, scale = 1, overflowX = "";
    css.walkRules(rule => {
      if (rule.selector === ".categoryRail") rule.walkDecls(declaration => {
        if (declaration.prop === "padding-top" || declaration.prop === "padding") paddingTop = parseFloat(declaration.value);
        if (declaration.prop === "overflow-x") overflowX = declaration.value;
      });
      if (rule.selector === ".categoryRail img") rule.walkDecls("height", declaration => { imageHeight = Math.max(imageHeight, parseFloat(declaration.value)); });
      if (rule.selector === ".categoryRail a:hover img") rule.walkDecls("transform", declaration => {
        const match = declaration.value.match(/translateY\(-([\d.]+)px\) scale\(([\d.]+)\)/);
        if (match) { lift = Number(match[1]); scale = Number(match[2]); }
      });
    });
    expect(overflowX).toBe("auto");
    expect(imageHeight).toBeGreaterThan(0);
    expect(lift).toBeGreaterThan(0);
    expect(paddingTop).toBeGreaterThanOrEqual(lift + imageHeight * (scale - 1) / 2 + 1);
  });
});
