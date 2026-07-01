import { getPool, query, withTenantContext } from "@/lib/db/client";

export type BillingOverview = {
  tenant_id: string;
  tenant_name: string;
  billing_status: string;
  trial_ends_at: string;
  subscription_id: string;
  subscription_status: string;
  current_period_end: string | null;
  plan_key: string;
  plan_name: string;
  amount_cents: number;
  discount_percent: number;
  discount_expires_at: string | null;
  discounted_amount_cents: number;
  currency: string;
  latest_invoice_id: string | null;
  latest_invoice_status: string | null;
  latest_invoice_checkout_url: string | null;
  latest_invoice_due_at: string | null;
};

export type BillingInvoice = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  due_at: string;
  checkout_url: string | null;
  provider_preference_id: string | null;
  provider_payment_id: string | null;
};

export type BillingAccess = {
  tenant_id: string;
  billing_status: string;
  trial_ends_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  allowed: boolean;
  reason: string | null;
};

export async function getBillingOverview(userId: string, tenantId: string): Promise<BillingOverview | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<BillingOverview>(
      `
        select
          t.id as tenant_id,
          t.name as tenant_name,
          t.billing_status,
          t.trial_ends_at,
          ts.id as subscription_id,
          ts.status as subscription_status,
          ts.current_period_end,
          p.key as plan_key,
          p.name as plan_name,
          p.amount_cents,
          ts.discount_percent,
          ts.discount_expires_at,
          greatest(
            100,
            round(p.amount_cents * (1 - case when ts.discount_expires_at is null or ts.discount_expires_at > now() then ts.discount_percent else 0 end / 100.0))
          )::int as discounted_amount_cents,
          p.currency::text as currency,
          latest.id as latest_invoice_id,
          latest.status as latest_invoice_status,
          latest.checkout_url as latest_invoice_checkout_url,
          latest.due_at as latest_invoice_due_at
        from tenants t
        join tenant_subscriptions ts on ts.tenant_id = t.id
        join billing_plans p on p.id = ts.plan_id
        left join lateral (
          select id, status, checkout_url, due_at
          from billing_invoices bi
          where bi.tenant_id = t.id
          order by bi.created_at desc
          limit 1
        ) latest on true
        where t.id = $1
        limit 1
      `,
      [tenantId]
    );

    return result.rows[0] ?? null;
  });
}

export async function getBillingAccess(userId: string, tenantId: string): Promise<BillingAccess> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<
      Omit<BillingAccess, "allowed" | "reason"> & {
        trial_active: boolean;
        subscription_active: boolean;
      }
    >(
      `
        select
          t.id as tenant_id,
          t.billing_status,
          t.trial_ends_at::text as trial_ends_at,
          ts.status as subscription_status,
          ts.current_period_end::text as current_period_end,
          (t.billing_status = 'trial' and t.trial_ends_at > now()) as trial_active,
          (t.billing_status = 'active' and (ts.current_period_end is null or ts.current_period_end > now())) as subscription_active
        from tenants t
        left join tenant_subscriptions ts on ts.tenant_id = t.id
        where t.id = $1
        limit 1
      `,
      [tenantId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        tenant_id: tenantId,
        billing_status: "blocked",
        trial_ends_at: null,
        subscription_status: null,
        current_period_end: null,
        allowed: false,
        reason: "Tenant não encontrado."
      };
    }

    if (row.billing_status === "cancelled" || row.billing_status === "blocked") {
      return {
        ...row,
        allowed: false,
        reason: "A assinatura deste tenant está bloqueada. Regularize a cobrança para continuar criando ou alterando dados."
      };
    }

    if (row.trial_active || row.subscription_active) {
      return { ...row, allowed: true, reason: null };
    }

    if (row.billing_status === "past_due") {
      return {
        ...row,
        allowed: false,
        reason: "Existe uma cobrança pendente para este tenant. Regularize a assinatura para continuar."
      };
    }

    if (row.billing_status === "trial") {
      return {
        ...row,
        allowed: false,
        reason: "O período de teste deste tenant expirou. Ative a assinatura para continuar."
      };
    }

    return {
      ...row,
      allowed: false,
      reason: "A assinatura deste tenant precisa ser regularizada para continuar."
    };
  });
}

export async function getOrCreateOpenInvoice(
  userId: string,
  tenantId: string
): Promise<BillingInvoice & { tenant_name: string; plan_name: string }> {
  return withTenantContext(userId, tenantId, async (client) => {
    const existing = await client.query<BillingInvoice & { tenant_name: string; plan_name: string }>(
      `
        select
          bi.id,
          bi.tenant_id,
          bi.subscription_id,
          bi.status,
          bi.amount_cents,
          bi.currency::text as currency,
          bi.due_at,
          bi.checkout_url,
          bi.provider_preference_id,
          bi.provider_payment_id,
          t.name as tenant_name,
          p.name as plan_name
        from billing_invoices bi
        join tenant_subscriptions ts on ts.id = bi.subscription_id
        join billing_plans p on p.id = ts.plan_id
        join tenants t on t.id = bi.tenant_id
        where bi.tenant_id = $1
          and bi.status in ('open', 'pending')
        order by bi.created_at desc
        limit 1
      `,
      [tenantId]
    );
    if (existing.rows[0]) return existing.rows[0];

    const created = await client.query<BillingInvoice & { tenant_name: string; plan_name: string }>(
      `
        insert into billing_invoices (
          tenant_id,
          subscription_id,
          status,
          amount_cents,
          currency,
          due_at,
          external_reference
        )
        select
          ts.tenant_id,
          ts.id,
          'open',
          greatest(
            0,
            round(p.amount_cents * (1 - case when ts.discount_expires_at is null or ts.discount_expires_at > now() then ts.discount_percent else 0 end / 100.0))
          )::int,
          p.currency,
          now() + interval '7 days',
          gen_random_uuid()::text
        from tenant_subscriptions ts
        join billing_plans p on p.id = ts.plan_id
        where ts.tenant_id = $1
        returning id, tenant_id, subscription_id, status, amount_cents, currency::text as currency, due_at, checkout_url, provider_preference_id, provider_payment_id
      `,
      [tenantId]
    );
    if (!created.rows[0]) throw new Error("Billing subscription not found.");

    if (created.rows[0].amount_cents <= 0) {
      await client.query(
        `
          update billing_invoices
          set status = 'paid',
              paid_at = now(),
              updated_at = now(),
              metadata = metadata || '{"discounted_to_zero": true}'::jsonb
          where id = $1
        `,
        [created.rows[0].id]
      );
      await client.query(
        `
          update tenant_subscriptions
          set status = 'active',
              current_period_start = now(),
              current_period_end = now() + interval '1 month',
              updated_at = now()
          where tenant_id = $1
        `,
        [tenantId]
      );
      await client.query(
        `
          update tenants
          set billing_status = 'active',
              billing_blocked_at = null,
              updated_at = now()
          where id = $1
        `,
        [tenantId]
      );
    }

    await client.query("update billing_invoices set external_reference = id::text where id = $1", [created.rows[0].id]);

    const hydrated = await client.query<BillingInvoice & { tenant_name: string; plan_name: string }>(
      `
        select
          bi.id,
          bi.tenant_id,
          bi.subscription_id,
          bi.status,
          bi.amount_cents,
          bi.currency::text as currency,
          bi.due_at,
          bi.checkout_url,
          bi.provider_preference_id,
          bi.provider_payment_id,
          t.name as tenant_name,
          p.name as plan_name
        from billing_invoices bi
        join tenant_subscriptions ts on ts.id = bi.subscription_id
        join billing_plans p on p.id = ts.plan_id
        join tenants t on t.id = bi.tenant_id
        where bi.id = $1
        limit 1
      `,
      [created.rows[0].id]
    );

    return hydrated.rows[0];
  });
}

export async function extendTenantTrial(input: {
  actorUserId: string;
  tenantId: string;
  endsAt: string;
}): Promise<void> {
  await query("select set_config('app.user_id', $1, false)", [input.actorUserId]);
  await query(
    `
      update tenants
      set billing_status = 'trial',
          trial_ends_at = $2,
          billing_blocked_at = null,
          updated_at = now()
      where id = $1
    `,
    [input.tenantId, input.endsAt]
  );
  await query(
    `
      update tenant_subscriptions
      set status = 'trial',
          current_period_end = $2,
          updated_at = now()
      where tenant_id = $1
    `,
    [input.tenantId, input.endsAt]
  );
  await query(
    `
      update billing_invoices
      set status = 'cancelled',
          updated_at = now(),
          metadata = metadata || '{"cancelled_by_trial_extension": true}'::jsonb
      where tenant_id = $1
        and status in ('open', 'pending')
    `,
    [input.tenantId]
  );
  await query(
    `
      insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, 'billing.trial_extend', 'tenant', $1, $3)
    `,
    [input.tenantId, input.actorUserId, JSON.stringify({ endsAt: input.endsAt })]
  );
}

export async function applyTenantVoucher(input: {
  actorUserId: string;
  tenantId: string;
  discountPercent: number;
  expiresAt: string;
  note?: string | null;
}): Promise<void> {
  await query("select set_config('app.user_id', $1, false)", [input.actorUserId]);
  await query(
    `
      insert into billing_vouchers (tenant_id, discount_percent, expires_at, note, created_by)
      values ($1, $2, $3, $4, $5)
    `,
    [input.tenantId, input.discountPercent, input.expiresAt, input.note ?? null, input.actorUserId]
  );
  await query(
    `
      update tenant_subscriptions
      set discount_percent = $2,
          discount_expires_at = $3,
          discount_note = $4,
          updated_at = now()
      where tenant_id = $1
    `,
    [input.tenantId, input.discountPercent, input.expiresAt, input.note ?? null]
  );
  await query(
    `
      update billing_invoices
      set status = 'cancelled',
          updated_at = now(),
          metadata = metadata || '{"cancelled_by_voucher": true}'::jsonb
      where tenant_id = $1
        and status in ('open', 'pending')
    `,
    [input.tenantId]
  );
  await query(
    `
      insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, 'billing.voucher_apply', 'tenant', $1, $3)
    `,
    [
      input.tenantId,
      input.actorUserId,
      JSON.stringify({ discountPercent: input.discountPercent, expiresAt: input.expiresAt, note: input.note ?? null })
    ]
  );
}

export async function updateInvoiceCheckout(input: {
  invoiceId: string;
  preferenceId: string;
  checkoutUrl: string;
}): Promise<void> {
  await query(
    `
      update billing_invoices
      set status = 'pending',
          provider_preference_id = $2,
          checkout_url = $3,
          updated_at = now()
      where id = $1
    `,
    [input.invoiceId, input.preferenceId, input.checkoutUrl]
  );
}

export async function applyMercadoPagoPayment(input: {
  paymentId: string;
  status: string;
  externalReference: string | null;
  payload: unknown;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const invoice = await client.query<{
      id: string;
      tenant_id: string;
      subscription_id: string;
    }>(
      `
        select id, tenant_id, subscription_id
        from billing_invoices
        where id::text = $1 or external_reference = $1 or provider_payment_id = $2
        order by created_at desc
        limit 1
        for update
      `,
      [input.externalReference, input.paymentId]
    );

    const target = invoice.rows[0];
    await client.query(
      `
        insert into payment_events (tenant_id, invoice_id, event_type, provider_event_id, payload, processed_at)
        values ($1, $2, $3, $4, $5, now())
      `,
      [
        target?.tenant_id ?? null,
        target?.id ?? null,
        `payment.${input.status}`,
        input.paymentId,
        JSON.stringify(input.payload)
      ]
    );

    if (!target) {
      await client.query("commit");
      return;
    }

    if (input.status === "approved") {
      await client.query(
        `
          update billing_invoices
          set status = 'paid',
              paid_at = coalesce(paid_at, now()),
              provider_payment_id = $2,
              updated_at = now()
          where id = $1
        `,
        [target.id, input.paymentId]
      );

      await client.query(
        `
          update tenant_subscriptions
          set status = 'active',
              current_period_start = now(),
              current_period_end = now() + interval '1 month',
              updated_at = now()
          where id = $1
        `,
        [target.subscription_id]
      );

      await client.query(
        `
          update tenants
          set billing_status = 'active',
              billing_blocked_at = null,
              updated_at = now()
          where id = $1
        `,
        [target.tenant_id]
      );
    } else if (["cancelled", "rejected", "refunded", "charged_back"].includes(input.status)) {
      await client.query(
        `
          update billing_invoices
          set status = 'failed',
              provider_payment_id = $2,
              updated_at = now()
          where id = $1 and status <> 'paid'
        `,
        [target.id, input.paymentId]
      );
    } else {
      await client.query(
        `
          update billing_invoices
          set status = 'pending',
              provider_payment_id = $2,
              updated_at = now()
          where id = $1 and status <> 'paid'
        `,
        [target.id, input.paymentId]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
