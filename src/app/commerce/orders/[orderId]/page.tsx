import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { authorizedCommerceOrder } from "@/services/commerce/order-artworks";
import { getOrderWorkspaceItem } from "@/repositories/commerce-orders";
import { CommerceError } from "@/domain/commerce/commerce";
import { orderEventLabel } from "@/domain/commerce/order-workflow";
import { AppShell } from "@/components/layout/AppShell";
import { storeMoney } from "@/components/commerce/store-http";
import { CommerceOrderArtworks } from "@/components/commerce/CommerceOrderArtworks";
import { CommerceOrderProduction } from "@/components/commerce/CommerceOrderProduction";
import { CommerceOrderSeen } from "@/components/commerce/CommerceOrderAlerts";
import { StoreOrderContactDetails } from "@/components/commerce/StoreOrderContactDetails";
export const dynamic = "force-dynamic";
export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { session, profile, access } = await requireCommerceOrderAccess().catch(error => {
    if (error instanceof CommerceError && error.status === 401) redirect("/login");
    if (error instanceof CommerceError && [403, 404].includes(error.status)) redirect("/dashboard");
    throw error;
  });
  const { orderId } = await params;
  if (!z.string().uuid().safeParse(orderId).success) notFound();
  const fact = await getOrderWorkspaceItem(session.tenantId, session.userId, orderId);
  if (!fact) notFound();
  const order = await authorizedCommerceOrder(session.tenantId, orderId, null);
  const events = (await getPool().query("select type,metadata,created_at::text from commerce_order_events where tenant_id=$1 and order_id=$2 order by created_at desc limit 100", [session.tenantId, orderId])).rows;
  return <AppShell title={`Pedido #${order.id.slice(0, 8).toUpperCase()}`} subtitle={`Compra recebida em ${new Date(order.created_at).toLocaleString("pt-BR")}`} tenantName={profile.tenant_name} tenantLogoUrl={profile.tenant_logo_url} isSuperAdmin={profile.is_super_admin}>
    <CommerceOrderSeen orderId={order.id} seenThrough={fact.activity_at} />
    <Link href="/commerce/orders" className="mb-5 inline-block text-sm text-emerald-300 hover:underline">Voltar aos pedidos da loja</Link>
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-5">
        <div><h2 className="font-semibold">Itens da compra</h2><div className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800">{order.snapshot.items.map(item => <div key={item.id} className="flex min-w-0 flex-wrap justify-between gap-3 py-4"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{item.name}</h3><p className="mt-1 text-xs text-zinc-400">{item.quantity} un. × {storeMoney(item.unitCents)}{item.artworkName ? ` · ${item.artworkName}` : ""}</p></div><strong className="text-sm tabular-nums">{storeMoney(item.totalCents)}</strong></div>)}</div></div>
        <CommerceOrderArtworks endpoint={`/api/commerce/admin/orders/${order.id}/artworks`} admin />
        <details className="border-y border-zinc-800 py-3"><summary className="cursor-pointer text-sm font-semibold">Histórico do pedido</summary><ol className="mt-4 space-y-3">{events.map((event, index) => <li key={index} className="border-l border-zinc-700 pl-3 text-xs leading-5 text-zinc-400"><strong className="block font-medium text-zinc-200">{orderEventLabel(event.type)}</strong><time>{new Date(event.created_at).toLocaleString("pt-BR")}</time>{event.metadata?.note ? <p className="break-words">{String(event.metadata.note)}</p> : null}</li>)}</ol></details>
      </section>
      <aside className="order-first min-w-0 space-y-5 xl:order-none">
        <CommerceOrderProduction order={fact} canManage={access.manage} />
        <div className="space-y-2"><h2 className="font-semibold">Resumo da compra</h2><p className="flex justify-between gap-3 text-sm text-zinc-400"><span>Produtos</span><span>{storeMoney(order.subtotal_cents)}</span></p>{(order.snapshot.artworkDiscountCents ?? 0) > 0 ? <p className="text-xs text-emerald-300">Benefício por arte pronta já incluído: −{storeMoney(order.snapshot.artworkDiscountCents!)}</p> : null}<p className="flex justify-between gap-3 text-sm text-zinc-400"><span>Frete</span><span>{storeMoney(order.shipping_cents)}</span></p><p className="flex justify-between gap-3 border-t border-zinc-800 pt-3 font-semibold"><span>Total</span><span>{storeMoney(order.total_cents)}</span></p></div>
        <details className="border-t border-zinc-800 pt-4"><summary className="cursor-pointer text-sm font-semibold">Cliente, faturamento e entrega</summary><div className="mt-3 space-y-3"><p className="text-sm">{order.snapshot.customer.name}</p><p className="break-all text-xs text-zinc-400">{order.snapshot.customer.email}</p><StoreOrderContactDetails billing={order.snapshot.billing} address={order.snapshot.address} same={order.snapshot.deliveryAddressSameAsBilling} shippingOption={order.snapshot.shippingOption} /></div></details>
      </aside>
    </div>
  </AppShell>;
}
