import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { isProductDeletionConfirmation } from "@/domain/products/products";
import { archiveProductByVariant, updateProductVariant } from "@/repositories/products";
import { userHasPermission } from "@/repositories/users";

const updateProductSchema = z.object({
  productName: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  productActive: z.boolean(),
  variantName: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  externalOlistProductId: z.string().trim().optional().nullable(),
  unitCost: z.number().min(0),
  unitWeightKg: z.number().min(0),
  heightCm: z.number().min(0).optional().nullable(),
  widthCm: z.number().min(0).optional().nullable(),
  lengthCm: z.number().min(0).optional().nullable(),
  printDiameterMm: z.number().min(10).max(300).optional().nullable(),
  printShape: z.enum(["circle", "square", "rectangle", "triangle", "hexagon"]),
  printWidthMm: z.number().min(5).max(1000),
  printHeightMm: z.number().min(5).max(1000),
  printCornerStyle: z.enum(["sharp", "rounded"]),
  printCornerRadiusMm: z.number().min(0).max(500),
  printShapeRotationDegrees: z.number().min(-180).max(180),
  printBleedMm: z.number().min(0).max(50),
  printSafeMarginMm: z.number().min(0).max(50),
  allowPrintRotation: z.boolean(),
  variantActive: z.boolean(),
  aliases: z.array(z.object({
    alias: z.string().trim().min(2).max(120),
    source: z.enum(["manual", "ai"]).default("manual")
  })).max(30).default([])
});

export async function PATCH(request: Request, context: { params: Promise<{ variantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { variantId } = await context.params;
  const params = z.string().uuid().safeParse(variantId);
  if (!params.success) {
    return NextResponse.json({ ok: false, error: "Invalid variant id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateProductVariant(session.userId, session.tenantId, variantId, parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update product." },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ variantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { variantId } = await context.params;
  const params = z.string().uuid().safeParse(variantId);
  if (!params.success) return NextResponse.json({ ok: false, error: "Produto inválido." }, { status: 400 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "products:write");
  if (!allowed) return NextResponse.json({ ok: false, error: "Você não possui permissão para excluir produtos." }, { status: 403 });

  const body = z.object({ confirmation: z.string().max(30) }).safeParse(await request.json().catch(() => null));
  if (!body.success || !isProductDeletionConfirmation(body.data.confirmation)) {
    return NextResponse.json({ ok: false, error: "Digite excluir para confirmar a operação." }, { status: 400 });
  }

  try {
    const archived = await archiveProductByVariant(session.userId, session.tenantId, variantId);
    if (!archived) return NextResponse.json({ ok: false, error: "Produto não encontrado ou já excluído." }, { status: 404 });
    return NextResponse.json({ ok: true, product: archived });
  } catch (error) {
    console.error("Product archive failed.", {
      tenantId: session.tenantId,
      variantId,
      message: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return NextResponse.json({ ok: false, error: "Não foi possível excluir o produto." }, { status: 500 });
  }
}
