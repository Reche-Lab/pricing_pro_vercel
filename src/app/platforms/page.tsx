import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PlatformForm } from "@/components/platforms/PlatformForm";
import { PlatformList } from "@/components/platforms/PlatformList";
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
          <PlatformList
            platforms={platforms.map((platform) => ({
              id: platform.id,
              key: platform.key,
              name: platform.name,
              commissionRate: Number(platform.commission_rate),
              fixedFee: Number(platform.fixed_fee),
              sellerShippingCost: Number(platform.seller_shipping_cost),
              sellerShippingThreshold: Number(platform.seller_shipping_threshold),
              defaultPricingMode: platform.default_pricing_mode,
              sortOrder: platform.sort_order
            }))}
          />
        </section>
      </div>
    </AppShell>
  );
}
