import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ShippingQuoteForm } from "@/components/shipping/ShippingQuoteForm";
import { getCurrentSession } from "@/lib/auth/session";
import { listProductVariants } from "@/repositories/products";
import { getSessionProfile } from "@/repositories/users";

export default async function ShippingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, variants] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    listProductVariants(session.userId, session.tenantId)
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShell title="Frete" subtitle="Cotacao Correios por tenant usando embalagens cadastradas." tenantName={profile.tenant_name}>
      <ShippingQuoteForm
        variants={variants.map((variant) => ({
          id: variant.variant_id,
          label: `${variant.product_name} - ${variant.variant_name}`
        }))}
      />
    </AppShell>
  );
}
