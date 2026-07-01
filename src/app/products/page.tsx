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
    <AppShell
      title="Produtos"
      subtitle="Cadastro inicial de produtos, variantes e curvas."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
        <ProductForm />
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="font-semibold">Produtos cadastrados</h2>
          </div>
          <div className="space-y-3 p-3">
            {products.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum produto cadastrado.</p>
            ) : (
              products.map((item) => (
                <div
                  className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/45 p-3 text-sm shadow-sm shadow-black/10 transition-colors hover:border-zinc-700"
                  key={item.variant_id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-l-2 border-amber-400/70 pl-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-white">
                        {item.product_name} - {item.variant_name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-400">{item.product_category}</span>
                        {item.sku ? <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-400">SKU {item.sku}</span> : null}
                        {!item.variant_active || !item.product_active ? (
                          <span className="rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-200">Inativo</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-1 text-left sm:text-right">
                      <p className="font-semibold text-white">{brl.format(Number(item.unit_cost))}</p>
                      <p className="text-xs text-zinc-500">{Number(item.unit_weight_kg).toFixed(4)} kg/un para frete</p>
                      <p className="text-xs text-zinc-500">
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
