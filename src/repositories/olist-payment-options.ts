import { withTenantContext } from "@/lib/db/client";

export type OlistPaymentOptionKind = "payment_method" | "receiving_method" | "category";

export type OlistPaymentOptionRow = {
  id: string;
  kind: OlistPaymentOptionKind;
  external_id: string;
  name: string;
  group_name: string | null;
  active: boolean;
  synced_at: string;
};

export type QuotePaymentTermInstallment = {
  installmentNumber: number;
  dueDate?: string | null;
  days?: number | null;
  amount: number;
  notes?: string | null;
  paymentMethodExternalId?: string | null;
  paymentMethodName?: string | null;
  receivingMethodExternalId?: string | null;
  receivingMethodName?: string | null;
};

export type QuotePaymentTermInput = {
  paymentMethodExternalId?: string | null;
  paymentMethodName?: string | null;
  receivingMethodExternalId?: string | null;
  receivingMethodName?: string | null;
  categoryExternalId?: string | null;
  categoryName?: string | null;
  installmentsCount?: number | null;
  notes?: string | null;
  installments?: QuotePaymentTermInstallment[];
};

export type QuotePaymentTermRow = {
  id: string;
  quote_id: string;
  payment_method_external_id: string | null;
  payment_method_name: string | null;
  receiving_method_external_id: string | null;
  receiving_method_name: string | null;
  category_external_id: string | null;
  category_name: string | null;
  installments_count: number;
  notes: string | null;
  installments: QuotePaymentTermInstallment[];
};

export async function listOlistPaymentOptions(userId: string, tenantId: string): Promise<OlistPaymentOptionRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<OlistPaymentOptionRow>(
      `
        select id, kind, external_id, name, group_name, active, synced_at
        from olist_payment_options
        where tenant_id = $1 and active = true
        order by kind, name
      `,
      [tenantId]
    );
    return result.rows;
  });
}

export async function replaceOlistPaymentOptions(
  userId: string,
  tenantId: string,
  options: Array<{
    kind: OlistPaymentOptionKind;
    externalId: string;
    name: string;
    groupName?: string | null;
    raw?: unknown;
  }>
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query("update olist_payment_options set active = false, updated_at = now() where tenant_id = $1", [tenantId]);

    for (const option of options) {
      await client.query(
        `
          insert into olist_payment_options (
            tenant_id,
            kind,
            external_id,
            name,
            group_name,
            raw,
            active,
            synced_at
          )
          values ($1, $2, $3, $4, $5, $6, true, now())
          on conflict (tenant_id, kind, external_id) do update
            set name = excluded.name,
                group_name = excluded.group_name,
                raw = excluded.raw,
                active = true,
                synced_at = now(),
                updated_at = now()
        `,
        [
          tenantId,
          option.kind,
          option.externalId,
          option.name,
          clean(option.groupName),
          JSON.stringify(option.raw ?? {})
        ]
      );
    }

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
        values ($1, $2, 'olist.payment_options_sync', 'olist_payment_options', $3)
      `,
      [tenantId, userId, JSON.stringify({ count: options.length })]
    );

    const result = await client.query<OlistPaymentOptionRow>(
      `
        select id, kind, external_id, name, group_name, active, synced_at
        from olist_payment_options
        where tenant_id = $1 and active = true
        order by kind, name
      `,
      [tenantId]
    );
    return result.rows;
  });
}

export async function getQuotePaymentTerm(
  userId: string,
  tenantId: string,
  quoteId: string
): Promise<QuotePaymentTermRow | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const termResult = await client.query<Omit<QuotePaymentTermRow, "installments">>(
      `
        select
          id,
          quote_id,
          payment_method_external_id,
          payment_method_name,
          receiving_method_external_id,
          receiving_method_name,
          category_external_id,
          category_name,
          installments_count,
          notes
        from quote_payment_terms
        where tenant_id = $1 and quote_id = $2
        limit 1
      `,
      [tenantId, quoteId]
    );
    const term = termResult.rows[0];
    if (!term) return null;

    const installmentsResult = await client.query<{
      installment_number: number;
      due_date: string | null;
      days: number | null;
      amount: string;
      notes: string | null;
      payment_method_external_id: string | null;
      payment_method_name: string | null;
      receiving_method_external_id: string | null;
      receiving_method_name: string | null;
    }>(
      `
        select
          installment_number,
          due_date::text as due_date,
          days,
          amount::text as amount,
          notes,
          payment_method_external_id,
          payment_method_name,
          receiving_method_external_id,
          receiving_method_name
        from quote_payment_installments
        where tenant_id = $1 and quote_payment_term_id = $2
        order by installment_number
      `,
      [tenantId, term.id]
    );

    return {
      ...term,
      installments: installmentsResult.rows.map((row) => ({
        installmentNumber: row.installment_number,
        dueDate: row.due_date,
        days: row.days,
        amount: Number(row.amount),
        notes: row.notes,
        paymentMethodExternalId: row.payment_method_external_id,
        paymentMethodName: row.payment_method_name,
        receivingMethodExternalId: row.receiving_method_external_id,
        receivingMethodName: row.receiving_method_name
      }))
    };
  });
}

export async function upsertQuotePaymentTerm(
  userId: string,
  tenantId: string,
  quoteId: string,
  input: QuotePaymentTermInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const installments = normalizeInstallments(input);
    const termResult = await client.query<{ id: string }>(
      `
        insert into quote_payment_terms (
          tenant_id,
          quote_id,
          payment_method_external_id,
          payment_method_name,
          receiving_method_external_id,
          receiving_method_name,
          category_external_id,
          category_name,
          installments_count,
          notes,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (tenant_id, quote_id) do update
          set payment_method_external_id = excluded.payment_method_external_id,
              payment_method_name = excluded.payment_method_name,
              receiving_method_external_id = excluded.receiving_method_external_id,
              receiving_method_name = excluded.receiving_method_name,
              category_external_id = excluded.category_external_id,
              category_name = excluded.category_name,
              installments_count = excluded.installments_count,
              notes = excluded.notes,
              updated_at = now()
        returning id
      `,
      [
        tenantId,
        quoteId,
        clean(input.paymentMethodExternalId),
        clean(input.paymentMethodName),
        clean(input.receivingMethodExternalId),
        clean(input.receivingMethodName),
        clean(input.categoryExternalId),
        clean(input.categoryName),
        installments.length || Math.max(1, Math.min(24, input.installmentsCount ?? 1)),
        clean(input.notes),
        userId
      ]
    );
    const termId = termResult.rows[0].id;
    await client.query("delete from quote_payment_installments where tenant_id = $1 and quote_payment_term_id = $2", [tenantId, termId]);

    for (const installment of installments) {
      await client.query(
        `
          insert into quote_payment_installments (
            tenant_id,
            quote_payment_term_id,
            installment_number,
            due_date,
            days,
            amount,
            notes,
            payment_method_external_id,
            payment_method_name,
            receiving_method_external_id,
            receiving_method_name
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          tenantId,
          termId,
          installment.installmentNumber,
          clean(installment.dueDate),
          installment.days ?? null,
          installment.amount,
          clean(installment.notes),
          clean(installment.paymentMethodExternalId ?? input.paymentMethodExternalId),
          clean(installment.paymentMethodName ?? input.paymentMethodName),
          clean(installment.receivingMethodExternalId ?? input.receivingMethodExternalId),
          clean(installment.receivingMethodName ?? input.receivingMethodName)
        ]
      );
    }

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.payment_term_upsert', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ installments: installments.length, paymentMethodExternalId: input.paymentMethodExternalId })]
    );

    return termId;
  });
}

function normalizeInstallments(input: QuotePaymentTermInput) {
  const installments = input.installments?.length ? input.installments : [{
    installmentNumber: 1,
    days: 0,
    amount: 0,
    notes: input.notes
  }];

  return installments.slice(0, 24).map((installment, index) => ({
    installmentNumber: Math.max(1, Math.trunc(installment.installmentNumber || index + 1)),
    dueDate: clean(installment.dueDate),
    days: installment.days === null || installment.days === undefined ? null : Math.max(0, Math.trunc(installment.days)),
    amount: Math.max(0, Number(Number(installment.amount).toFixed(2))),
    notes: clean(installment.notes),
    paymentMethodExternalId: clean(installment.paymentMethodExternalId),
    paymentMethodName: clean(installment.paymentMethodName),
    receivingMethodExternalId: clean(installment.receivingMethodExternalId),
    receivingMethodName: clean(installment.receivingMethodName)
  }));
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
