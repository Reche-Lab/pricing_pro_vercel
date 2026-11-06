import { z } from "zod";
import { orderFilters } from "@/domain/commerce/order-workflow";
import { getOrderWorkspace } from "@/repositories/commerce-orders";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { commerceFailure, commerceJson } from "@/services/commerce/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { session, access } = await requireCommerceOrderAccess();
    const query = new URL(request.url).searchParams;
    const parsed = z.object({ filter: z.enum(orderFilters).default("all"), page: z.coerce.number().int().min(1).max(100000).default(1) }).safeParse(Object.fromEntries(query));
    if (!parsed.success) return commerceJson({ error: "Revise o filtro de pedidos." }, 400);
    const result = await getOrderWorkspace(session.tenantId, session.userId, { ...parsed.data, pageSize: query.get("summary") === "1" ? 5 : 20 });
    return commerceJson({ ...result, access });
  } catch (error) { return commerceFailure(error, "orders.workspace"); }
}
