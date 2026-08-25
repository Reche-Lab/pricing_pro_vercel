import { NextResponse } from "next/server";
import { z } from "zod";
import { getOriginalFinancialImport } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  const { importId } = await context.params;
  if (!z.string().uuid().safeParse(importId).success) return NextResponse.json({ ok: false, error: "Importação inválida." }, { status: 400 });
  try {
    const file = await getOriginalFinancialImport(auth.session.userId, auth.session.tenantId, importId);
    if (!file?.original_content) return NextResponse.json({ ok: false, error: "Arquivo original indisponível." }, { status: 404 });
    const body = new ArrayBuffer(file.original_content.byteLength);
    new Uint8Array(body).set(file.original_content);
    return new Response(body, { headers: {
      "content-type": file.content_type,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`,
      "cache-control": "private, no-store"
    } });
  } catch (error) { return financeError(error, "imports.download"); }
}
