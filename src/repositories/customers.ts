import { withTenantContext } from "@/lib/db/client";

export type CustomerRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
};

export type CreateCustomerInput = {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function listCustomers(userId: string, tenantId: string): Promise<CustomerRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<CustomerRow>(
      `
        select id, name, document, email, phone, postal_code, city, state, created_at
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
          city,
          state
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id, name, document, email, phone, postal_code, city, state, created_at
      `,
      [
        tenantId,
        input.name,
        input.document || null,
        input.email || null,
        input.phone || null,
        input.postalCode || null,
        input.addressLine || null,
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

export async function countCustomers(userId: string, tenantId: string): Promise<number> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from customers where tenant_id = $1",
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}
