import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { userHasPermission } from "@/repositories/users";
import { suggestProductAliases } from "@/services/openrouter/product-alias-agent";

export const maxDuration = 60;

const schema = z.object({
  productName: z.string().trim().min(2).max(160),
  variantName: z.string().trim().min(1).max(160),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  sku: z.string().trim().max(120).optional().nullable(),
  currentAliases: z.array(z.string().trim().min(2).max(120)).max(30).default([])
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sessão expirada." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const allowed = await userHasPermission(session.userId, session.tenantId, "products:write");
  if (!allowed) return NextResponse.json({ ok: false, error: "Sem permissão para editar produtos." }, { status: 403 });

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Preencha produto, variante e categoria antes de pedir sugestões." }, { status: 400 });
  }

  try {
    console.info("Product alias suggestions started.", {
      tenantId: session.tenantId,
      productName: body.data.productName,
      variantName: body.data.variantName,
      currentAliasCount: body.data.currentAliases.length
    });
    const aliases = await suggestProductAliases(body.data);
    console.info("Product alias suggestions completed.", {
      tenantId: session.tenantId,
      suggestionCount: aliases.length
    });
    return NextResponse.json({ ok: true, aliases });
  } catch (error) {
    console.error("Product alias suggestions failed.", {
      tenantId: session.tenantId,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível sugerir aliases."
    }, { status: 502 });
  }
}
