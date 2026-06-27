import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PlatformForm } from "@/components/platforms/PlatformForm";
import { PlatformInlineEditor } from "@/components/platforms/PlatformInlineEditor";
import { getCurrentSession } from "@/lib/auth/session";
import { listPlatformRules } from "@/repositories/platforms";
import { getSessionProfile } from "@/repositories/users";

export default async function PlatformsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, platforms] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listPlatformRules(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Canais" subtitle="Comissoes, taxas e regras comerciais por tenant." tenantName={profile.tenant_name}>
      <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
        <PlatformForm />
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="font-semibold">Canais cadastrados</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {platforms.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Nenhum canal cadastrado.</p>
            ) : (
              platforms.map((platform) => (
                <div className="grid gap-3 px-5 py-4 text-sm" key={platform.id}>
                  <div>
                    <p className="font-medium text-white">{platform.name}</p>
                    <p className="text-zinc-500">{platform.key}</p>
                  </div>
                  <PlatformInlineEditor
                    platform={{
                      id: platform.id,
                      name: platform.name,
                      commissionRate: Number(platform.commission_rate),
                      fixedFee: Number(platform.fixed_fee),
                      sellerShippingCost: Number(platform.seller_shipping_cost),
                      sellerShippingThreshold: Number(platform.seller_shipping_threshold),
                      sortOrder: platform.sort_order
                    }}
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
