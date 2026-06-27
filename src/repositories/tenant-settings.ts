import { withTenantContext } from "@/lib/db/client";

export type TenantShippingProfile = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  company_phone: string | null;
  company_site: string | null;
  company_document: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export type UpdateTenantShippingProfileInput = {
  name?: string | null;
  logoUrl?: string | null;
  companyPhone?: string | null;
  companySite?: string | null;
  companyDocument?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function getTenantShippingProfile(
  userId: string,
  tenantId: string
): Promise<TenantShippingProfile | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<TenantShippingProfile>(
      `
        select
          id,
          name,
          slug,
          logo_url,
          company_phone,
          company_site,
          company_document,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state
        from tenants
        where id = $1
        limit 1
      `,
      [tenantId]
    );

    return result.rows[0] ?? null;
  });
}

export async function updateTenantShippingProfile(
  userId: string,
  tenantId: string,
  input: UpdateTenantShippingProfileInput
): Promise<TenantShippingProfile> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<TenantShippingProfile>(
      `
        update tenants
        set name = coalesce($2, name),
            logo_url = $3,
            company_phone = $4,
            company_site = $5,
            company_document = $6,
            postal_code = $7,
            address_line = $8,
            address_number = $9,
            address_complement = $10,
            district = $11,
            city = $12,
            state = $13,
            updated_at = now()
        where id = $1
        returning
          id,
          name,
          slug,
          logo_url,
          company_phone,
          company_site,
          company_document,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state
      `,
      [
        tenantId,
        clean(input.name),
        clean(input.logoUrl),
        clean(input.companyPhone),
        clean(input.companySite),
        clean(input.companyDocument),
        clean(input.postalCode),
        clean(input.addressLine),
        clean(input.addressNumber),
        clean(input.addressComplement),
        clean(input.district),
        clean(input.city),
        clean(input.state)?.toUpperCase() ?? null
      ]
    );

    if (!result.rows[0]) throw new Error("Tenant not found.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'tenant_settings.update', 'tenant', $1)
      `,
      [tenantId, userId]
    );

    return result.rows[0];
  });
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
