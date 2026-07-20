import { withTenantContext } from "@/lib/db/client";

export type CustomerRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  external_olist_id: string | null;
  created_at: string;
};

export type CreateCustomerInput = {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function listCustomers(userId: string, tenantId: string): Promise<CustomerRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<CustomerRow>(
      `
        select
          id,
          name,
          document,
          email,
          phone,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state,
          external_olist_id,
          created_at
        from customers
        where tenant_id = $1
        order by created_at desc
        limit 100
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function createCustomer(
  userId: string,
  tenantId: string,
  input: CreateCustomerInput
): Promise<CustomerRow> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<CustomerRow>(
      `
        insert into customers (
          tenant_id,
          name,
          document,
          email,
          phone,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning
          id,
          name,
          document,
          email,
          phone,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state,
          external_olist_id,
          created_at
      `,
      [
        tenantId,
        input.name,
        input.document || null,
        input.email || null,
        input.phone || null,
        input.postalCode || null,
        input.addressLine || null,
        input.addressNumber || null,
        input.addressComplement || null,
        input.district || null,
        input.city || null,
        input.state || null
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'customers.create', 'customer', $3)
      `,
      [tenantId, userId, result.rows[0].id]
    );

    return result.rows[0];
  });
}

export async function getCustomerById(
  userId: string,
  tenantId: string,
  customerId: string
): Promise<CustomerRow | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<CustomerRow>(
      `
        select
          id,
          name,
          document,
          email,
          phone,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state,
          external_olist_id,
          created_at
        from customers
        where tenant_id = $1 and id = $2
        limit 1
      `,
      [tenantId, customerId]
    );

    return result.rows[0] ?? null;
  });
}

export async function updateCustomerExternalOlistId(
  userId: string,
  tenantId: string,
  customerId: string,
  externalOlistId: string
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        update customers
        set external_olist_id = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, customerId, externalOlistId]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'customers.olist_sync', 'customer', $3, $4)
      `,
      [tenantId, userId, customerId, JSON.stringify({ externalOlistId })]
    );
  });
}

export async function updateCustomerFromOlistProfile(
  userId: string,
  tenantId: string,
  customerId: string,
  input: {
    externalOlistId: string;
    name?: string | null;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
    postalCode?: string | null;
    addressLine?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        update customers
        set external_olist_id = $3,
            name = coalesce($4, name),
            document = coalesce($5, document),
            email = coalesce($6, email),
            phone = coalesce($7, phone),
            postal_code = coalesce($8, postal_code),
            address_line = coalesce($9, address_line),
            address_number = coalesce($10, address_number),
            address_complement = coalesce($11, address_complement),
            district = coalesce($12, district),
            city = coalesce($13, city),
            state = coalesce($14, state),
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [
        tenantId,
        customerId,
        clean(input.externalOlistId),
        clean(input.name),
        clean(input.document),
        clean(input.email),
        clean(input.phone),
        clean(input.postalCode),
        clean(input.addressLine),
        clean(input.addressNumber),
        clean(input.addressComplement),
        clean(input.district),
        clean(input.city),
        clean(input.state)?.toUpperCase() ?? null
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'customers.olist_profile_sync', 'customer', $3, $4)
      `,
      [tenantId, userId, customerId, JSON.stringify({ externalOlistId: input.externalOlistId })]
    );
  });
}

export async function countCustomers(userId: string, tenantId: string): Promise<number> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from customers where tenant_id = $1",
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

function clean(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
