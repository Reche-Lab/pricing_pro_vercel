import { redirect } from "next/navigation";
import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { orderFilters } from "@/domain/commerce/order-workflow";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { getOrderWorkspace } from "@/repositories/commerce-orders";
import { AppShell } from "@/components/layout/AppShell";
import { CommerceOrdersWorkspace } from "@/components/commerce/CommerceOrdersWorkspace";
export const dynamic = "force-dynamic";
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireCommerceOrderAccess().catch(error => {
    if (error instanceof CommerceError && error.status === 401) redirect("/login");
    if (error instanceof CommerceError && [403, 404].includes(error.status)) redirect("/dashboard");
    throw error;
  });
  const params = await searchParams;
  const filter = z.enum(orderFilters).catch("all").parse(params.filter);
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(params.page ?? 1);
  const data = await getOrderWorkspace(context.session.tenantId, context.session.userId, { filter, page });
  return <AppShell title="Pedidos da loja" subtitle="Compras, aprovação das artes e produção." tenantName={context.profile.tenant_name} tenantLogoUrl={context.profile.tenant_logo_url} isSuperAdmin={context.profile.is_super_admin}><CommerceOrdersWorkspace data={data} filter={filter} /></AppShell>;
}
