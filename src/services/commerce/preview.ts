import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import type { CommerceStore } from "@/repositories/commerce";
import { requireCommerceAdmin } from "./http";

export async function requireCommercePreview(
  slug: string,
): Promise<CommerceStore> {
  const { session } = await requireCommerceAdmin();
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
    throw new CommerceError("Prévia não encontrada.", 404);
  // Draft access is exclusive to this authenticated tenant, never a public flag.
  const result = await getPool().query<CommerceStore>(
    "select s.*,t.slug from commerce_stores s join tenants t on t.id=s.tenant_id where s.tenant_id=$1 and t.slug=$2 and t.status='active'",
    [session.tenantId, slug],
  );
  if (!result.rows[0])
    throw new CommerceError(
      "Prévia não encontrada. Salve a loja primeiro.",
      404,
    );
  return result.rows[0];
}
