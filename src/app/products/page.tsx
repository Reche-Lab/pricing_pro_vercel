import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AnchorEditor } from "@/components/products/AnchorEditor";
import { ProductEditForm } from "@/components/products/ProductEditForm";
import { ProductForm } from "@/components/products/ProductForm";
import { getCurrentSession } from "@/lib/auth/session";
import { listPlatformRules } from "@/repositories/platforms";
import { listProductsAdmin } from "@/repositories/products";
import { getSessionProfile } from "@/repositories/users";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProductsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, products, platforms] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductsAdmin(session.userId, session.tenantId),
    listPlatformRules(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Produtos" subtitle="Cadastro inicial de produtos, variantes e curvas." tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
        <ProductForm />
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="font-semibold">Produtos cadastrados</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {products.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum produto cadastrado.</p>
            ) : (
              products.map((item) => (
                <div className="grid gap-3 px-5 py-4 text-sm" key={item.variant_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">
                        {item.product_name} - {item.variant_name}
                      </p>
                      <p className="text-zinc-500">
                        {item.product_category} {item.sku ? `- ${item.sku}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">{brl.format(Number(item.unit_cost))}</p>
                      <p className="text-zinc-500">{Number(item.unit_weight_kg).toFixed(4)} kg/un para frete</p>
                      <p className="text-zinc-500">
                        {item.height_cm && item.width_cm && item.length_cm
                          ? `${Number(item.height_cm)} x ${Number(item.width_cm)} x ${Number(item.length_cm)} cm`
                          : "Medidas não cadastradas"}
                      </p>
                    </div>
                  </div>
                  <ProductEditForm
                    product={{
                      productName: item.product_name,
                      category: item.product_category,
                      description: item.variant_description ?? item.product_description,
                      productActive: item.product_active,
                      variantId: item.variant_id,
                      variantName: item.variant_name,
                      sku: item.sku,
                      unitCost: item.unit_cost,
                      unitWeightKg: item.unit_weight_kg,
                      heightCm: item.height_cm,
                      widthCm: item.width_cm,
                      lengthCm: item.length_cm,
                      variantActive: item.variant_active
                    }}
                  />
                  <AnchorEditor
                    anchors={item.anchors}
                    mode={item.curve_mode}
                    platforms={platforms.map((platform) => ({ id: platform.id, name: platform.name }))}
                    variantId={item.variant_id}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
