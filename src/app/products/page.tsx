import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AnchorEditor } from "@/components/products/AnchorEditor";
import { ProductForm } from "@/components/products/ProductForm";
import { getCurrentSession } from "@/lib/auth/session";
import { listProductsAdmin } from "@/repositories/products";
import { getSessionProfile } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProductsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, products] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductsAdmin(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Produtos" subtitle="Cadastro inicial de produtos, variantes e curvas." tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
        <ProductForm />
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="font-semibold">Produtos cadastrados</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {products.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum produto cadastrado.</p>
            ) : (
              products.map((item) => (
                <div className="grid gap-3 px-5 py-4 text-sm" key={item.variant_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-950">
                        {item.product_name} - {item.variant_name}
                      </p>
                      <p className="text-zinc-500">
                        {item.product_category} {item.sku ? `- ${item.sku}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-zinc-950">{brl.format(Number(item.unit_cost))}</p>
                      <p className="text-zinc-500">{Number(item.unit_weight_kg).toFixed(4)} kg/un</p>
                    </div>
                  </div>
                  <AnchorEditor anchors={item.anchors} variantId={item.variant_id} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
