import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PricingCalculator } from "@/components/pricing/PricingCalculator";
import type { PricingAnchors } from "@/domain/pricing/types";
import { getCurrentSession } from "@/lib/auth/session";
import { listPlatformRules } from "@/repositories/platforms";
import { getSessionProfile } from "@/repositories/users";
import { listProductVariants } from "@/repositories/products";

export default async function PricingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants, platforms] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId),
    listPlatformRules(session.userId, session.tenantId)
  ]);

  if (!profile) redirect("/login");

  const mappedVariants = variants.map((variant) => ({
    id: variant.variant_id,
    productName: variant.product_name,
    variantName: variant.variant_name,
    unitCost: Number(variant.unit_cost),
    unitWeightKg: Number(variant.unit_weight_kg),
    anchors: mapAnchors(variant.anchors)
  }));

  return (
    <AppShell
      title="Precificador"
      subtitle="Simulacao de curvas, comissoes e margem por quantidade."
      tenantName={profile.tenant_name}
    >
      <PricingCalculator variants={mappedVariants} platforms={mapPlatforms(platforms)} />
    </AppShell>
  );
}

function mapAnchors(anchors: Record<string, number> | null): PricingAnchors {
  return {
    1: Number(anchors?.["1"] ?? 0),
    10: Number(anchors?.["10"] ?? 0),
    50: Number(anchors?.["50"] ?? 0),
    100: Number(anchors?.["100"] ?? 0),
    500: Number(anchors?.["500"] ?? 0),
    1000: Number(anchors?.["1000"] ?? 0)
  };
}

function mapPlatforms(platforms: Awaited<ReturnType<typeof listPlatformRules>>) {
  return Object.fromEntries(
    platforms.map((platform) => [
      platform.id,
      {
        name: platform.name,
        commissionRate: Number(platform.commission_rate),
        fixedFee: Number(platform.fixed_fee),
        sellerShippingCost: Number(platform.seller_shipping_cost),
        sellerShippingThreshold: Number(platform.seller_shipping_threshold)
      }
    ])
  );
}
