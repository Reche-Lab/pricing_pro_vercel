import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { requireCommerceAdmin } from "@/services/commerce/http";
import type { CommerceOrder } from "@/repositories/commerce";
import { AppShell } from "@/components/layout/AppShell";
import { storeMoney } from "@/components/commerce/store-http";
export const dynamic = "force-dynamic";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { session, profile } = await requireCommerceAdmin();
  const { orderId } = await params;
  if (!z.string().uuid().safeParse(orderId).success) notFound();
  const order = (
    await getPool().query<CommerceOrder>(
      "select *,created_at::text from commerce_orders where tenant_id=$1 and id=$2",
      [session.tenantId, orderId],
    )
  ).rows[0];
  if (!order) notFound();
  const events = (
    await getPool().query(
      "select type,metadata,created_at::text from commerce_order_events where tenant_id=$1 and order_id=$2 order by created_at",
      [session.tenantId, orderId],
    )
  ).rows;
  return (
    <AppShell
      title={`Pedido ${order.id.slice(0, 8).toUpperCase()}`}
      tenantName={profile.tenant_name}
      tenantLogoUrl={profile.tenant_logo_url}
      isSuperAdmin={profile.is_super_admin}
    >
      <Link
        href="/commerce"
        className="mb-5 inline-block text-sm text-emerald-300 underline"
      >
        Voltar à loja
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-5">
          <h2 className="font-semibold">Itens e artes aprovadas</h2>
          {order.snapshot.items.map((item) => {
            const line = order.snapshot.lines.find((l) => l.id === item.id);
            return (
              <div
                key={item.id}
                className="space-y-2 rounded-lg border border-zinc-800 p-4"
              >
                <h3>{item.name}</h3>
                <p className="text-sm text-zinc-400">
                  {item.quantity} un. × {storeMoney(item.unitCents)} ·{" "}
                  {item.artworkName}
                </p>
                <p className="font-semibold">{storeMoney(item.totalCents)}</p>
                {line?.artworkId ? (
                  <div className="flex flex-wrap gap-4 text-sm text-emerald-300">
                    <a
                      target="_blank"
                      href={`/api/commerce/admin/orders/${order.id}/files?artworkId=${line.artworkId}`}
                    >
                      Baixar original
                    </a>
                    <a
                      target="_blank"
                      href={`/api/commerce/admin/orders/${order.id}/files?artworkId=${line.artworkId}&prepared=1`}
                    >
                      Baixar arte enquadrada
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
          <h2 className="pt-3 font-semibold">Histórico</h2>
          {events.map((event, index) => (
            <p
              key={index}
              className="border-b border-zinc-800 pb-3 text-sm text-zinc-400"
            >
              {new Date(event.created_at).toLocaleString("pt-BR")} ·{" "}
              {event.type}
              {event.metadata.note ? ` · ${event.metadata.note}` : ""}
            </p>
          ))}
        </section>
        <aside className="min-w-0 space-y-4">
          <h2 className="font-semibold">Comprador</h2>
          <p>{order.snapshot.customer.name}</p>
          <p className="break-all text-sm text-zinc-400">
            {order.snapshot.customer.email}
          </p>
          <h2 className="pt-3 font-semibold">Entrega</h2>
          {order.snapshot.address ? (
            <p className="whitespace-pre-wrap text-sm text-zinc-400">
              {order.snapshot.address.name}
              <br />
              {order.snapshot.address.phone}
              <br />
              {order.snapshot.address.street}, {order.snapshot.address.number}{" "}
              {order.snapshot.address.complement}
              <br />
              {order.snapshot.address.district} · {order.snapshot.address.city}/
              {order.snapshot.address.state}
              <br />
              {order.snapshot.address.postalCode}
              <br />
              {order.snapshot.address.attention
                ? `Aos cuidados de ${order.snapshot.address.attention}`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-zinc-400">Retirada pessoalmente</p>
          )}
          <p className="text-sm">
            Produtos: {storeMoney(order.subtotal_cents)}
          </p>
          <p className="text-sm">Frete: {storeMoney(order.shipping_cents)}</p>
          <p className="text-xl font-semibold">
            Total: {storeMoney(order.total_cents)}
          </p>
          <p className="text-sm text-emerald-300">
            {order.payment_status === "paid"
              ? "Pagamento confirmado"
              : order.payment_status === "refunded"
                ? "Estornado"
                : "Pagamento pendente"}
          </p>
          {order.payment_status === "paid" &&
          order.snapshot.lines.some((l) => l.artworkId) ? (
            <div className="flex flex-col gap-3 text-sm">
              <a
                className="rounded-md border border-zinc-700 p-3"
                target="_blank"
                href={`/api/commerce/admin/orders/${order.id}/files?pdf=1`}
              >
                Visualizar folhas A4
              </a>
              <a
                className="rounded-md border border-zinc-700 p-3"
                href={`/api/commerce/admin/orders/${order.id}/files?pdf=1&download=1`}
              >
                Baixar PDF de produção
              </a>
            </div>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
