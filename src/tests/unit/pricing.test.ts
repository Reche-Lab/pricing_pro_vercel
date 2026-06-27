import { describe, expect, it } from "vitest";
import {
  calculateAnchoredUnitPrice,
  calculateFinalUnitPrice,
  calculateLogisticUnitPrice,
  calculatePlatformCosts,
  calculateQuote,
  buildPricingSimulationSeries,
  comparePricingSimulationSeries,
  recomputeIntermediateAnchors
} from "@/domain/pricing/pricing";
import type { PricingAnchors } from "@/domain/pricing/types";

const anchors: PricingAnchors = {
  1: 8,
  10: 3.8,
  50: 2.78,
  100: 2.49,
  500: 2.3,
  1000: 1.99
};

describe("pricing domain", () => {
  it("returns exact prices at anchor quantities", () => {
    expect(calculateAnchoredUnitPrice(1, anchors)).toBe(8);
    expect(calculateAnchoredUnitPrice(10, anchors)).toBe(3.8);
    expect(calculateAnchoredUnitPrice(1000, anchors)).toBe(1.99);
  });

  it("interpolates prices geometrically between anchors", () => {
    expect(calculateAnchoredUnitPrice(25, anchors)).toBeCloseTo(3.1806, 4);
  });

  it("calculates logistic price and clamps at minimum after 1000 units", () => {
    expect(calculateLogisticUnitPrice(50, 1.99, 8, 50, 1.5)).toBeCloseTo(4.995, 3);
    expect(calculateLogisticUnitPrice(1500, 1.99, 8, 50, 1.5)).toBe(1.99);
  });

  it("recomputes intermediate anchors between base and minimum", () => {
    const output = recomputeIntermediateAnchors(anchors);
    expect(output[1]).toBe(8);
    expect(output[1000]).toBe(1.99);
    expect(output[10]).toBeCloseTo(5.0313, 4);
    expect(output[500]).toBeCloseTo(2.2881, 4);
  });

  it("adds commission, fixed fee and seller shipping when threshold is reached", () => {
    const platform = {
      commissionRate: 0.14,
      fixedFee: 6.75,
      sellerShippingCost: 21.45,
      sellerShippingThreshold: 79
    };

    const finalUnit = calculateFinalUnitPrice(100, 2.49, platform);
    expect(finalUnit).toBeCloseTo(3.2233, 4);
  });

  it("calculates platform costs from the final order total", () => {
    const costs = calculatePlatformCosts(315.2907, {
      commissionRate: 0.14,
      fixedFee: 6.75,
      sellerShippingCost: 21.45,
      sellerShippingThreshold: 79
    });

    expect(costs.commissionTotal).toBeCloseTo(44.1407, 4);
    expect(costs.fixedFeeTotal).toBe(6.75);
    expect(costs.sellerShippingTotal).toBe(21.45);
  });

  it("returns a complete quote calculation result", () => {
    const quote = calculateQuote({
      quantity: 100,
      unitCost: 0.67,
      method: "anchors",
      anchors,
      platform: {
        commissionRate: 0,
        fixedFee: 0,
        sellerShippingCost: 0,
        sellerShippingThreshold: 0
      }
    });

    expect(quote.baseUnitPrice).toBe(2.49);
    expect(quote.finalUnitPrice).toBe(2.49);
    expect(quote.subtotal).toBeCloseTo(249);
    expect(quote.costOfGoodsTotal).toBe(67);
    expect(quote.profit).toBeCloseTo(182);
    expect(quote.marginPercent).toBeCloseTo(73.0924, 4);
  });

  it("builds pricing simulation points across quantities", () => {
    const series = buildPricingSimulationSeries(
      {
        unitCost: 0.67,
        method: "anchors",
        anchors,
        platform: {
          commissionRate: 0.14,
          fixedFee: 4,
          sellerShippingCost: 0,
          sellerShippingThreshold: 0
        }
      },
      [10, 100, 1000]
    );

    expect(series).toHaveLength(3);
    expect(series[0].label).toBe("10");
    expect(series[1].quantity).toBe(100);
    expect(series[1].commissionTotal).toBeGreaterThan(0);
  });

  it("compares current and simulated anchor curves", () => {
    const simulatedAnchors: PricingAnchors = { ...anchors, 100: 2.69, 1000: 2.09 };
    const comparison = comparePricingSimulationSeries(
      {
        unitCost: 0.67,
        method: "anchors",
        anchors,
        platform: {
          commissionRate: 0,
          fixedFee: 0,
          sellerShippingCost: 0,
          sellerShippingThreshold: 0
        }
      },
      {
        unitCost: 0.67,
        method: "anchors",
        anchors: simulatedAnchors,
        platform: {
          commissionRate: 0,
          fixedFee: 0,
          sellerShippingCost: 0,
          sellerShippingThreshold: 0
        }
      },
      [100]
    );

    expect(comparison[0].unitPriceDelta).toBeCloseTo(0.2, 4);
    expect(comparison[0].marginDelta).toBeGreaterThan(0);
  });
});
