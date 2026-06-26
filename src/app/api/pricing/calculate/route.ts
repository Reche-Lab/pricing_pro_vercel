import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateQuote } from "@/domain/pricing/pricing";

const anchorsSchema = z.object({
  1: z.number().nonnegative(),
  10: z.number().nonnegative(),
  50: z.number().nonnegative(),
  100: z.number().nonnegative(),
  500: z.number().nonnegative(),
  1000: z.number().nonnegative()
});

const calculateSchema = z.object({
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
  method: z.enum(["anchors", "logistic"]),
  anchors: anchorsSchema.optional(),
  logistic: z
    .object({
      basePrice: z.number().nonnegative(),
      minPrice: z.number().nonnegative(),
      q0: z.number().positive(),
      n: z.number().positive()
    })
    .optional(),
  platform: z.object({
    commissionRate: z.number().min(0).max(0.99),
    fixedFee: z.number().nonnegative(),
    sellerShippingCost: z.number().nonnegative(),
    sellerShippingThreshold: z.number().nonnegative()
  })
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = calculateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = calculateQuote(parsed.data);
  return NextResponse.json({ ok: true, result });
}
