import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PricingCalculator } from "@/components/pricing/PricingCalculator";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { getCurrentSession } from "@/lib/auth/session";
import { listPlatformRules } from "@/repositories/platforms";
import { getSessionProfile } from "@/repositories/users";
import { listProductVariants } from "@/repositories/products";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { getIntegrationConnection } from "@/repositories/integrations";

export default async function PricingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants, platforms, tenant, correiosConnection, melhorEnvioConnection] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId),
    listPlatformRules(session.userId, session.tenantId),
    getTenantShippingProfile(session.userId, session.tenantId),
    getIntegrationConnection(session.userId, session.tenantId, "correios"),
    getIntegrationConnection(session.userId, session.tenantId, "melhor_envio")
  ]);

  if (!profile) redirect("/login");

  const mappedVariants = variants.map((variant) => ({
    id: variant.variant_id,
    productName: variant.product_name,
    variantName: variant.variant_name,
    unitCost: Number(variant.unit_cost),
    unitWeightKg: Number(variant.unit_weight_kg),
    curve: mapCurve(variant.curve_mode, variant.anchors),
    platformCurves: mapPlatformCurves(variant.platform_curves)
  }));

  return (
    <AppShell
      title="Precificador"
      subtitle="Simulacao de curvas, comissoes e margem por quantidade."
      tenantLogoUrl={profile.tenant_logo_url}
      tenantName={profile.tenant_name}
    >
      <PricingCalculator
        activeShippingServices={{
          correios: correiosConnection?.status === "active",
          melhorEnvio: melhorEnvioConnection?.status === "active"
        }}
        defaultOriginPostalCode={tenant?.postal_code ?? ""}
        variants={mappedVariants}
        platforms={mapPlatforms(platforms)}
      />
    </AppShell>
  );
}

function mapCurve(mode: PricingCurveMode | null, anchors: Record<string, number> | null): PricingCurve {
  return {
    mode: mode ?? "interpolated",
    points: Object.entries(anchors ?? {})
      .map(([quantity, unitPrice]) => ({
        quantity: Number(quantity),
        unitPrice: Number(unitPrice)
      }))
      .sort((a, b) => a.quantity - b.quantity)
  };
}

function mapPlatformCurves(
  platformCurves: Record<string, { mode: PricingCurveMode; anchors: Record<string, number> | null }> | null | undefined
) {
  return Object.fromEntries(
    Object.entries(platformCurves ?? {}).map(([platformId, curve]) => [
      platformId,
      mapCurve(curve.mode, curve.anchors)
    ])
  );
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
        sellerShippingThreshold: Number(platform.seller_shipping_threshold),
        defaultPricingMode: platform.default_pricing_mode
      }
    ])
  );
}
