import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PackagingForm } from "@/components/packaging/PackagingForm";
import { getCurrentSession } from "@/lib/auth/session";
import { listPackagingBoxes } from "@/repositories/packaging";
import { listProductVariants } from "@/repositories/products";
import { getSessionProfile } from "@/repositories/users";

export default async function PackagingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants, boxes] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId),
    listPackagingBoxes(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  const variantOptions = variants.map((variant) => ({
    id: variant.variant_id,
    label: `${variant.product_name} - ${variant.variant_name}`
  }));
  const variantLabelById = Object.fromEntries(variantOptions.map((variant) => [variant.id, variant.label]));

  return (
    <AppShell title="Embalagens" subtitle="Caixas e capacidades por variante." tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[480px_1fr]">
        <PackagingForm variants={variantOptions} />
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="font-semibold">Embalagens cadastradas</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {boxes.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhuma embalagem cadastrada.</p>
            ) : (
              boxes.map((box) => (
                <div className="grid gap-3 px-5 py-4 text-sm" key={box.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-950">{box.name}</p>
                      <p className="text-zinc-500">
                        {Number(box.height_cm)} x {Number(box.width_cm)} x {Number(box.length_cm)} cm
                      </p>
                    </div>
                    <p className="font-medium text-zinc-950">{Number(box.weight_kg).toFixed(3)} kg</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {Object.entries(box.capacities ?? {}).map(([variantId, capacity]) => (
                      <div className="rounded-md bg-zinc-50 px-3 py-2" key={variantId}>
                        <p className="text-xs text-zinc-500">{variantLabelById[variantId] ?? variantId}</p>
                        <p className="font-medium text-zinc-950">{capacity} un.</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
