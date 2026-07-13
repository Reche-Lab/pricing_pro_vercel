import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createQuote, listQuotes } from "@/repositories/quotes";

const artworkFileSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"]),
  fileSize: z.number().int().min(1).max(5 * 1024 * 1024),
  dataUrl: z.string().startsWith("data:").max(7_200_000)
});

const pricingCurveSchema = z.object({
  mode: z.enum(["interpolated", "step"]).optional().default("interpolated"),
  points: z.array(
    z.object({
      quantity: z.number().int().min(1).max(50000),
      unitPrice: z.number().min(0).max(100000)
    })
  ).min(1).max(50)
});

const quoteSchema = z.object({
  productVariantId: z.string().uuid().optional(),
  platformRuleId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50000).optional(),
  pricingCurve: pricingCurveSchema.optional(),
  pricingRule: z.enum(["per_item", "per_art_average", "aggregate_total"]).optional(),
  items: z.array(
    z.object({
      productVariantId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50000),
      artworkName: z.string().trim().max(120).optional().nullable(),
      pricingCurve: pricingCurveSchema.optional(),
      artworkFile: artworkFileSchema.optional().nullable()
    })
  ).min(1).max(50).optional(),
  artworkName: z.string().trim().max(120).optional().nullable(),
  artworkFile: artworkFileSchema.optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().trim().min(2).optional().nullable(),
  customerDocument: z.string().trim().optional().nullable(),
  customerEmail: z.string().trim().email().optional().or(z.literal("")).nullable(),
  customerPhone: z.string().trim().optional().nullable(),
  customerPostalCode: z.string().trim().optional().nullable(),
  customerAddressLine: z.string().trim().optional().nullable(),
  customerAddressNumber: z.string().trim().optional().nullable(),
  customerAddressComplement: z.string().trim().optional().nullable(),
  customerDistrict: z.string().trim().optional().nullable(),
  customerCity: z.string().trim().optional().nullable(),
  customerState: z.string().trim().max(2).optional().nullable(),
  customerExternalOlistId: z.string().trim().max(80).optional().nullable(),
  shippingTotal: z.number().min(0).max(100000).optional(),
  includeCommission: z.boolean().optional(),
  includeFixedFee: z.boolean().optional(),
  includeSellerShipping: z.boolean().optional(),
  platformOverride: z.object({
    commissionRate: z.number().min(0).max(0.99).optional(),
    fixedFee: z.number().min(0).max(100000).optional(),
    sellerShippingCost: z.number().min(0).max(100000).optional(),
    sellerShippingThreshold: z.number().min(0).max(100000).optional()
  }).optional(),
  validDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const quotes = await listQuotes(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, quotes });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.customerId && !parsed.data.customerName) {
    return NextResponse.json(
      { ok: false, error: "Select an existing customer or provide a new customer name." },
      { status: 400 }
    );
  }

  if (!parsed.data.items?.length && (!parsed.data.productVariantId || !parsed.data.quantity)) {
    return NextResponse.json(
      { ok: false, error: "Provide productVariantId and quantity or composite quote items." },
      { status: 400 }
    );
  }

  const quote = await createQuote(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, quote }, { status: 201 });
}
