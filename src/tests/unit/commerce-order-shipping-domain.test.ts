import { describe, expect, it } from "vitest";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  aggregateShipmentStatus,
  assertShippingCost,
  carrierSnapshotSchema,
  nextShipmentStatus,
  normalizedShipmentStatus,
  orderShippingActionSchema,
  safeShippingUrl,
  shippingEligibility,
  shippingStatusLabel,
  shippingVolumeSchema,
  trackingValue,
} from "@/domain/commerce/order-shipping";

type EligibleOrder = Parameters<typeof shippingEligibility>[0];
const order: EligibleOrder = {
  payment_status: "paid", fulfillment_status: "production", payment_environment: "production",
  snapshot: { delivery: "shipping", shippingOption: { id: "melhor_envio:2" } },
};
const volume = { width: 20, height: 10, length: 30, weight: 0.5 };
const snapshot = {
  originPostalCode: "01310100", destinationPostalCode: "20040002",
  volumes: [volume], insuranceValueCents: 15000,
};

describe("order shipping eligibility", () => {
  it.each(["production", "shipped", "completed"])("allows paid carrier orders in %s", fulfillment_status => {
    expect(shippingEligibility({ ...order, fulfillment_status })).toEqual({ eligible: true, reason: null });
  });

  const blocked: Array<{ name: string; changes: Partial<EligibleOrder>; reason: string }> = [
    { name: "cancelled order", changes: { cancelled_at: "2026-11-23T12:00:00Z" }, reason: "encerrado" },
    { name: "deleted order", changes: { deleted_at: new Date("2026-11-23T12:00:00Z") }, reason: "encerrado" },
    { name: "test payment", changes: { payment_environment: "test" }, reason: "teste" },
    { name: "refunded payment", changes: { payment_status: "refunded" }, reason: "pagamento" },
    { name: "unpaid order", changes: { payment_status: "pending" }, reason: "pagamento" },
    { name: "unknown payment", changes: { payment_status: "unknown" }, reason: "pagamento" },
    { name: "pickup", changes: { snapshot: { ...order.snapshot, delivery: "pickup" } }, reason: "retirada" },
    { name: "manual shipping", changes: { snapshot: { delivery: "shipping", shippingOption: { id: "manual" } } }, reason: "Melhor Envio" },
    { name: "missing shipping option", changes: { snapshot: { delivery: "shipping" } }, reason: "Melhor Envio" },
    { name: "null shipping option", changes: { snapshot: { delivery: "shipping", shippingOption: null } }, reason: "Melhor Envio" },
    { name: "production not started", changes: { fulfillment_status: "received" }, reason: "produção" },
    { name: "unknown fulfillment", changes: { fulfillment_status: "unknown" }, reason: "produção" },
  ];
  it.each(blocked)("blocks $name with a useful reason", ({ changes, reason }) => {
    expect(shippingEligibility({ ...order, ...changes })).toEqual({ eligible: false, reason: expect.stringContaining(reason) });
  });

  it.each(["melhor_envio:0", "melhor_envio:-1", "melhor_envio:01", "melhor_envio:2x", "melhor_envio:2.5", "melhor_envio:", "other:2", " melhor_envio:2"])("rejects invalid carrier service ID %s", id => {
    expect(shippingEligibility({ ...order, snapshot: { delivery: "shipping", shippingOption: { id } } }).eligible).toBe(false);
  });

  it("prioritizes a closed-order reason over payment and environment reasons", () => {
    expect(shippingEligibility({ ...order, cancelled_at: "closed", payment_environment: "test", payment_status: "pending" }).reason).toContain("encerrado");
  });
});

describe("shipping URLs and tracking codes", () => {
  it("accepts and canonicalizes an absolute HTTPS URL without losing its query", () => {
    expect(safeShippingUrl("HTTPS://CARRIER.EXAMPLE:443/track?code=AB123#events")).toBe("https://carrier.example/track?code=AB123#events");
  });

  it.each([
    undefined, null, 42, true, {}, [], "", "invalid", "/private/label.pdf", "//carrier.example/track",
    "http://carrier.example/track", "javascript:alert(1)", "data:text/html,private", "file:///tmp/label.pdf",
    "https://user:secret@carrier.example/track", "https://user@carrier.example/track",
    "https://:secret@carrier.example/track", "https://", "https://carrier.example:invalid/track",
  ].map(value => ({ value })))("rejects unsafe or malformed URL $value", ({ value }) => {
    expect(safeShippingUrl(value)).toBeNull();
  });

  it("enforces the URL length limit at its boundary", () => {
    const prefix = "https://carrier.example/";
    const url = prefix + "a".repeat(2000 - prefix.length);
    expect(safeShippingUrl(url)).toBe(url);
    expect(safeShippingUrl(url + "a")).toBeNull();
  });

  it.each(["AB123456789BR", "abc", "A_b-1.2", "A".repeat(100)])("accepts tracking code %s", value => {
    expect(trackingValue(value)).toBe(value);
  });

  it.each([null, undefined, 123, {}, "", "AB", "A".repeat(101), " AB123 ", "AB 123", "<script>", "https://carrier.example", "ábc"].map(value => ({ value })))("rejects invalid tracking code $value", ({ value }) => {
    expect(trackingValue(value)).toBeNull();
  });
});

describe("shipment normalization", () => {
  it.each([
    { source: {}, expected: "cart" },
    { source: { status: "unknown" }, expected: "cart" },
    { source: { status: "pending" }, expected: "cart" },
    { source: { status: "released" }, expected: "purchased" },
    { source: { status: "paid" }, expected: "purchased" },
    { source: { paid_at: "2026-11-20T12:00:00Z" }, expected: "purchased" },
    { source: { status: "generated" }, expected: "label_ready" },
    { source: { generated_at: "2026-11-20T12:00:00Z" }, expected: "label_ready" },
    { source: { status: "posted" }, expected: "posted" },
    { source: { posted_at: "2026-11-20T12:00:00Z" }, expected: "posted" },
    { source: { status: "delivered" }, expected: "delivered" },
    { source: { delivered_at: "2026-11-22T12:00:00Z" }, expected: "delivered" },
    { source: { status: "undelivered" }, expected: "exception" },
    { source: { status: "paused" }, expected: "exception" },
    { source: { status: "suspended" }, expected: "exception" },
    { source: { status: "canceled" }, expected: "cancelled" },
    { source: { status: "cancelled" }, expected: "cancelled" },
    { source: { canceled_at: "2026-11-20T12:00:00Z" }, expected: "cancelled" },
    { source: { cancelled_at: "2026-11-20T12:00:00Z" }, expected: "cancelled" },
  ])("normalizes $source to $expected", ({ source, expected }) => {
    expect(normalizedShipmentStatus(source)).toBe(expected);
  });

  it.each([
    { source: {}, expected: "cart" },
    { source: { status: "paid" }, expected: "purchased" },
    { source: { status: "generated" }, expected: "label_ready" },
  ])("never treats tracking information as posting for $expected", ({ source, expected }) => {
    expect(normalizedShipmentStatus({
      ...source, tracking: "AB123456789BR", tracking_code: "AB123456789BR",
      tracking_url: "https://carrier.example/track", label_url: "https://carrier.example/private-label.pdf",
    })).toBe(expected);
  });

  it("uses confirmed delivery before earlier milestones and cancellation", () => {
    expect(normalizedShipmentStatus({ status: "cancelled", paid_at: "paid", generated_at: "generated", posted_at: "posted", delivered_at: "delivered" })).toBe("delivered");
    expect(normalizedShipmentStatus({ status: "paid", generated_at: "generated", posted_at: "posted" })).toBe("posted");
    expect(normalizedShipmentStatus({ status: "paid", generated_at: "generated" })).toBe("label_ready");
  });
});

describe("shipment status progression and multiple volumes", () => {
  const ranked = ["quoted", "cart", "purchased", "label_ready", "posted", "delivered"];

  it("advances or preserves every ranked state without regressing on stale updates", () => {
    ranked.forEach((current, currentRank) => ranked.forEach((candidate, candidateRank) => {
      expect(nextShipmentStatus(current, candidate), `${current} -> ${candidate}`).toBe(candidateRank >= currentRank ? candidate : current);
    }));
  });

  it.each(["exception", "cancelled"])("accepts %s before delivery but preserves confirmed delivery", candidate => {
    expect(nextShipmentStatus("posted", candidate)).toBe(candidate);
    expect(nextShipmentStatus("delivered", candidate)).toBe("delivered");
  });
  it("keeps a cancelled label terminal when delayed earlier events arrive", () => {
    expect(nextShipmentStatus("cancelled", "cart")).toBe("cancelled");
    expect(nextShipmentStatus("cancelled", "label_ready")).toBe("cancelled");
  });

  it.each(["exception", "review"])("recovers from %s using the latest provider state", current => {
    expect(nextShipmentStatus(current, "posted")).toBe("posted");
  });

  it("does not replace an established milestone with an unknown status", () => {
    expect(nextShipmentStatus("posted", "unknown")).toBe("posted");
  });

  it("uses the least advanced volume, regardless of input order, without mutating the volumes", () => {
    for (const first of ranked) for (const second of ranked) {
      const volumes = [first, second, "delivered"];
      const original = [...volumes];
      const expected = ranked[Math.min(ranked.indexOf(first), ranked.indexOf(second))];
      expect(aggregateShipmentStatus(volumes)).toBe(expected);
      expect(aggregateShipmentStatus([...volumes].reverse())).toBe(expected);
      expect(volumes).toEqual(original);
    }
  });

  it("only marks all volumes delivered once every volume is delivered", () => {
    expect(aggregateShipmentStatus([])).toBe("quoted");
    expect(aggregateShipmentStatus(["delivered"])).toBe("delivered");
    expect(aggregateShipmentStatus(["delivered", "delivered", "delivered"])).toBe("delivered");
    expect(aggregateShipmentStatus(["delivered", "posted", "delivered"])).toBe("posted");
    expect(aggregateShipmentStatus(["delivered", "label_ready"])).toBe("label_ready");
  });

  it("surfaces any exception and requires review for any cancelled volume", () => {
    for (const statuses of [["delivered", "exception", "posted"], ["exception", "delivered"]]) {
      expect(aggregateShipmentStatus(statuses)).toBe("exception");
    }
    for (const statuses of [["cancelled"], ["delivered", "cancelled"], ["exception", "cancelled", "posted"], ["cancelled", "exception"]]) {
      expect(aggregateShipmentStatus(statuses)).toBe("review");
    }
  });

  it.each([
    ["quoted", "Envio em conferência"], ["cart", "Etiqueta no carrinho"],
    ["purchased", "Etiqueta comprada"], ["label_ready", "Etiqueta pronta para impressão"],
    ["posted", "Pedido postado"], ["delivered", "Pedido entregue"],
    ["exception", "A entrega precisa de atenção"], ["cancelled", "Etiqueta cancelada"],
    ["review", "Confira o envio antes de continuar"], ["unknown", "Envio em atualização"],
  ])("humanizes %s", (status, label) => {
    expect(shippingStatusLabel(status)).toBe(label);
  });
});

describe("shipping cost confirmation", () => {
  const staleMessage = "O custo da etiqueta mudou ou não foi conferido. Atualize a conferência antes de continuar.";
  const differenceMessage = "Confirme a diferença entre o frete contratado e o custo atual da etiqueta. O cliente não será cobrado novamente.";
  const cases = [
    { name: "missing expected cost", current: 2000, contracted: 2000, input: {}, message: staleMessage },
    { name: "missing expected cost with acceptance", current: 2000, contracted: 1500, input: { acceptCostChange: true }, message: staleMessage },
    { name: "stale lower expected cost despite acceptance", current: 2000, contracted: 1500, input: { expectedCostCents: 1500, acceptCostChange: true }, message: staleMessage },
    { name: "stale higher expected cost despite acceptance", current: 1500, contracted: 2000, input: { expectedCostCents: 2000, acceptCostChange: true }, message: staleMessage },
    { name: "stale expected cost with no contracted difference", current: 2000, contracted: 2000, input: { expectedCostCents: 1900 }, message: staleMessage },
    { name: "unaccepted price increase", current: 2000, contracted: 1500, input: { expectedCostCents: 2000 }, message: differenceMessage },
    { name: "explicitly rejected price increase", current: 2000, contracted: 1500, input: { expectedCostCents: 2000, acceptCostChange: false }, message: differenceMessage },
    { name: "unaccepted price decrease", current: 1500, contracted: 2000, input: { expectedCostCents: 1500 }, message: differenceMessage },
  ];
  it.each(cases)("rejects $name with a 409 CommerceError", ({ current, contracted, input, message }) => {
    expect(() => assertShippingCost(current, contracted, input)).toThrow(CommerceError);
    expect(() => assertShippingCost(current, contracted, input)).toThrow(expect.objectContaining({ status: 409, message }));
  });

  it.each([
    { current: 2000, contracted: 2000, input: { expectedCostCents: 2000 } },
    { current: 2000, contracted: 2000, input: { expectedCostCents: 2000, acceptCostChange: false } },
    { current: 2000, contracted: 1500, input: { expectedCostCents: 2000, acceptCostChange: true } },
    { current: 1500, contracted: 2000, input: { expectedCostCents: 1500, acceptCostChange: true } },
    { current: 0, contracted: 0, input: { expectedCostCents: 0 } },
    { current: 0, contracted: 2000, input: { expectedCostCents: 0, acceptCostChange: true } },
  ])("accepts a freshly reviewed cost: $current / $contracted", ({ current, contracted, input }) => {
    expect(() => assertShippingCost(current, contracted, input)).not.toThrow();
  });
});

describe("shipping action schema", () => {
  it.each(["review", "cart", "checkout", "generate", "print", "refresh", "retry_notifications"])("accepts the action %s", action => {
    expect(orderShippingActionSchema.parse({ action })).toEqual({ action });
  });

  it("parses and trims a valid action without coercing flags or cent values", () => {
    const input = { action: "checkout", invoiceKey: ` ${"1".repeat(44)} `, senderStateRegister: " ISENTO ", productionReady: true, acceptCostChange: false, expectedCostCents: 0 };
    expect(orderShippingActionSchema.parse(input)).toEqual({ ...input, invoiceKey: "1".repeat(44), senderStateRegister: "ISENTO" });
    expect(orderShippingActionSchema.safeParse({ action: "checkout", expectedCostCents: 100000000 }).success).toBe(true);
  });

  it.each([
    {}, { action: "purchase" }, { action: "CHECKOUT" }, { action: 1 },
    { action: "checkout", expectedCostCents: -1 }, { action: "checkout", expectedCostCents: 1.5 },
    { action: "checkout", expectedCostCents: 100000001 }, { action: "checkout", expectedCostCents: "2000" },
    { action: "checkout", expectedCostCents: NaN }, { action: "checkout", expectedCostCents: Infinity },
    { action: "checkout", expectedCostCents: null }, { action: "checkout", productionReady: "true" },
    { action: "checkout", acceptCostChange: 1 }, { action: "checkout", acceptCostChange: "false" },
    { action: "checkout", invoiceKey: "1".repeat(43) }, { action: "checkout", invoiceKey: "1".repeat(45) },
    { action: "checkout", invoiceKey: "a".repeat(44) }, { action: "checkout", invoiceKey: null },
    { action: "checkout", senderStateRegister: " " }, { action: "checkout", senderStateRegister: "A" },
    { action: "checkout", senderStateRegister: "A".repeat(31) },
  ].map(input => ({ input })))("rejects malformed action input $input", ({ input }) => {
    expect(orderShippingActionSchema.safeParse(input).success).toBe(false);
  });

  it.each(["tenantId", "orderId", "actorId", "connectionId", "priceCents", "labelUrl", "trackingUrl"])("rejects client-supplied unknown field %s", field => {
    expect(orderShippingActionSchema.safeParse({ action: "checkout", [field]: "untrusted" }).success).toBe(false);
  });
});

describe("carrier snapshot and volume schemas", () => {
  it("accepts positive fractional measurements and valid inclusive limits", () => {
    expect(shippingVolumeSchema.parse(volume)).toEqual(volume);
    expect(shippingVolumeSchema.safeParse({ width: 1000, height: 1000, length: 1000, weight: 1000, insurance: 1000000 }).success).toBe(true);
    expect(shippingVolumeSchema.safeParse({ ...volume, insurance: 0 }).success).toBe(true);
  });

  it.each(["width", "height", "length", "weight"])("requires a bounded positive numeric %s", field => {
    for (const value of [0, -1, 1000.01, NaN, Infinity, "20", null, undefined]) {
      expect(shippingVolumeSchema.safeParse({ ...volume, [field]: value }).success, `${field}: ${value}`).toBe(false);
    }
  });

  it.each([-1, 1000001, Infinity, NaN, "150", null])("rejects invalid volume insurance %s", insurance => {
    expect(shippingVolumeSchema.safeParse({ ...volume, insurance }).success).toBe(false);
  });

  it("requires one to fifty valid volumes and preserves postal-code leading zeroes", () => {
    expect(carrierSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(carrierSnapshotSchema.safeParse({ ...snapshot, volumes: Array.from({ length: 50 }, () => ({ ...volume })) }).success).toBe(true);
    expect(carrierSnapshotSchema.safeParse({ ...snapshot, volumes: [] }).success).toBe(false);
    expect(carrierSnapshotSchema.safeParse({ ...snapshot, volumes: Array.from({ length: 51 }, () => ({ ...volume })) }).success).toBe(false);
    expect(carrierSnapshotSchema.safeParse({ ...snapshot, volumes: [{ ...volume, weight: 0 }] }).success).toBe(false);
  });

  it.each(["originPostalCode", "destinationPostalCode"])("requires exactly eight unformatted digits for %s", field => {
    for (const value of ["01310-100", "0131010", "013101000", "abcdefgh", " 01310100 ", 1310100, null, undefined]) {
      expect(carrierSnapshotSchema.safeParse({ ...snapshot, [field]: value }).success).toBe(false);
    }
  });

  it("bounds insured value in integer cents without coercion", () => {
    for (const insuranceValueCents of [0, 100000000]) {
      expect(carrierSnapshotSchema.safeParse({ ...snapshot, insuranceValueCents }).success).toBe(true);
    }
    for (const insuranceValueCents of [-1, 0.5, 100000001, Infinity, NaN, "15000", null, undefined]) {
      expect(carrierSnapshotSchema.safeParse({ ...snapshot, insuranceValueCents }).success).toBe(false);
    }
  });
});
