import type pg from "pg";
import { classifyTransactions } from "@/domain/finance/classification";
import { sha256 } from "@/domain/finance/csv";
import { calculateFinancialMetrics } from "@/domain/finance/metrics";
import { suggestInternalTransfers } from "@/domain/finance/transfers";
import type { ClassificationRule, ParsedStatement } from "@/domain/finance/types";
import { withTenantContext } from "@/lib/db/client";

export type FinancialAccountRow = {
  id: string;
  name: string;
  institution: string;
  account_type: string;
  currency: string;
  ownership_type: string;
  same_economic_entity: boolean;
  olist_account_id: string | null;
  required_for_monthly_close: boolean;
  active: boolean;
};

export type FinancialTransactionRow = {
  id: string;
  transaction_date: string;
  competence: string;
  original_description: string;
  normalized_description: string;
  counterparty: string | null;
  amount_cents: string;
  direction: "inflow" | "outflow" | "neutral";
  nature: string;
  include_external_cash_flow: boolean;
  include_operating_result: boolean;
  review_required: boolean;
  review_status: string;
  classification_confidence: string;
  classification_source: string;
  source_type: string;
  account_name: string;
  account_id: string;
  category_id: string | null;
  category_name: string | null;
  transfer_status: string | null;
  import_filename: string;
};

export type FinancialCategoryRow = {
  id: string;
  name: string;
  type: string;
  affects_operating_result: boolean;
};

export async function listFinancialAccounts(userId: string, tenantId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<FinancialAccountRow>(
      `select id, name, institution, account_type, currency, ownership_type,
              same_economic_entity, olist_account_id, required_for_monthly_close, active
       from financial_accounts where tenant_id = $1 order by active desc, name`,
      [tenantId]
    );
    return result.rows;
  });
}

export async function upsertFinancialAccount(userId: string, tenantId: string, input: {
  id?: string; name: string; institution: string; accountType: string; currency: string;
  ownershipType: string; sameEconomicEntity: boolean; requiredForMonthlyClose: boolean; olistAccountId?: string | null;
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    await ensureDefaultCategories(client, tenantId);
    const result = await client.query<{ id: string }>(
      `insert into financial_accounts (
         id, tenant_id, name, institution, account_type, currency, ownership_type,
         same_economic_entity, required_for_monthly_close, olist_account_id
       ) values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (tenant_id, name) do update set
         institution = excluded.institution, account_type = excluded.account_type,
         currency = excluded.currency, ownership_type = excluded.ownership_type,
         same_economic_entity = excluded.same_economic_entity,
         required_for_monthly_close = excluded.required_for_monthly_close,
         olist_account_id = excluded.olist_account_id, active = true, updated_at = now()
       returning id`,
      [input.id ?? null, tenantId, input.name, input.institution, input.accountType, input.currency,
        input.ownershipType, input.sameEconomicEntity, input.requiredForMonthlyClose, input.olistAccountId ?? null]
    );
    await audit(client, tenantId, userId, "financial_account.upsert", "financial_account", result.rows[0].id, null, input);
    return result.rows[0];
  });
}

async function ensureDefaultCategories(client: pg.PoolClient, tenantId: string) {
  await client.query(
    `with defaults(name, type, affects) as (
       values
         ('Receitas operacionais', 'income', true), ('Despesas operacionais', 'expense', true),
         ('Estornos e devoluções', 'neutral', true), ('Dívidas e financiamentos', 'neutral', false),
         ('Transferências internas', 'neutral', false), ('Aportes e retiradas', 'neutral', false),
         ('Reembolsos', 'neutral', false), ('Movimentações pessoais', 'neutral', false)
     )
     insert into financial_categories (tenant_id, name, type, affects_operating_result)
     select $1, defaults.name, defaults.type, defaults.affects from defaults
     where not exists (
       select 1 from financial_categories c where c.tenant_id = $1 and c.parent_id is null and c.name = defaults.name
     )`,
    [tenantId]
  );
}

export async function importFinancialStatement(input: {
  userId: string; tenantId: string; accountId: string; competence: string;
  filename: string; contentType: string; bytes: Uint8Array; checksum: string;
  parsed: ParsedStatement; detectionConfidence: number;
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    const existing = await client.query<{ id: string; status: string }>(
      "select id, status from bank_statement_imports where tenant_id = $1 and file_checksum = $2 limit 1",
      [input.tenantId, input.checksum]
    );
    if (existing.rows[0]) return { duplicate: true, importId: existing.rows[0].id, status: existing.rows[0].status };

    const account = await client.query<{ id: string }>(
      "select id from financial_accounts where tenant_id = $1 and id = $2 and active = true",
      [input.tenantId, input.accountId]
    );
    if (!account.rows[0]) throw new Error("Conta financeira não encontrada para este tenant.");

    const rules = await loadRules(client, input.tenantId);
    const classified = classifyTransactions(input.parsed.transactions, rules);
    const credits = classified.filter((item) => item.amountCents > 0).reduce((sum, item) => sum + item.amountCents, 0);
    const debits = Math.abs(classified.filter((item) => item.amountCents < 0).reduce((sum, item) => sum + item.amountCents, 0));
    const calculatedBalance = (input.parsed.initialBalanceCents ?? 0) + credits - debits;
    const reviewCount = classified.filter((item) => item.reviewRequired).length;
    const importResult = await client.query<{ id: string }>(
      `insert into bank_statement_imports (
         tenant_id, financial_account_id, source_type, competence, original_filename,
         original_content, content_type, file_size, file_checksum, adapter_name, adapter_version,
         status, raw_row_count, transaction_row_count, ignored_row_count, credit_total_cents,
         debit_total_cents, initial_balance_cents, final_balance_cents, calculated_balance_cents,
         currency, imported_by, metadata
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       returning id`,
      [input.tenantId, input.accountId, input.parsed.sourceType, `${input.competence}-01`, input.filename,
        Buffer.from(input.bytes), input.contentType, input.bytes.length, input.checksum,
        input.parsed.adapterName, input.parsed.adapterVersion, reviewCount ? "needs_review" : "completed",
        input.parsed.rawRows.length, classified.length, input.parsed.ignoredRows, credits, debits,
        input.parsed.initialBalanceCents ?? null, input.parsed.finalBalanceCents ?? null, calculatedBalance,
        input.parsed.currency, input.userId, JSON.stringify({ detectionConfidence: input.detectionConfidence, warnings: input.parsed.warnings })]
    );
    const importId = importResult.rows[0].id;

    const rowsByLine = new Map<number, string>();
    for (const rawRow of input.parsed.rawRows) {
      const rowHash = sha256(JSON.stringify(rawRow.values));
      const row = await client.query<{ id: string }>(
        `insert into bank_statement_raw_rows (
           tenant_id, import_id, source_line_number, source_identifier, raw_payload, row_hash
         ) values ($1,$2,$3,$4,$5,$6) returning id`,
        [input.tenantId, importId, rawRow.lineNumber, findSourceIdentifier(rawRow.values), JSON.stringify(rawRow.values), rowHash]
      );
      rowsByLine.set(rawRow.lineNumber, row.rows[0].id);
    }

    for (const transaction of classified) {
      const rawRowId = rowsByLine.get(transaction.sourceLineNumber);
      if (!rawRowId) throw new Error(`Linha bruta ${transaction.sourceLineNumber} não encontrada.`);
      await client.query(
        `insert into financial_transactions (
           tenant_id, import_id, financial_account_id, raw_row_id, transaction_date, competence,
           source_identifier, source_type, original_description, normalized_description, counterparty,
           amount_cents, currency, gross_amount_cents, fee_amount_cents, net_amount_cents, direction,
           nature, category_id, include_external_cash_flow, include_operating_result, review_required,
           review_status, classification_confidence, classification_source, classification_rule_id, raw_metadata
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [input.tenantId, importId, input.accountId, rawRowId, transaction.transactionDate, transaction.competence,
          transaction.sourceIdentifier ?? null, transaction.sourceType, transaction.originalDescription,
          transaction.normalizedDescription, transaction.counterparty ?? null, transaction.amountCents,
          transaction.currency, transaction.grossAmountCents ?? null, transaction.feeAmountCents ?? null,
          transaction.netAmountCents ?? transaction.amountCents, transaction.direction, transaction.nature,
          transaction.categoryId ?? null, transaction.includeExternalCashFlow, transaction.includeOperatingResult,
          transaction.reviewRequired, transaction.reviewRequired ? "pending" : "reviewed",
          transaction.classificationConfidence, transaction.classificationSource,
          transaction.classificationRuleId ?? null, JSON.stringify(transaction.rawData)]
      );
    }

    await client.query(
      `insert into financial_months (tenant_id, competence, status)
       values ($1, $2, 'partial') on conflict (tenant_id, competence) do update
       set status = case when financial_months.status = 'completed' then financial_months.status else 'partial' end,
           updated_at = now()`,
      [input.tenantId, `${input.competence}-01`]
    );
    await refreshTransferSuggestions(client, input.tenantId, `${input.competence}-01`);
    await audit(client, input.tenantId, input.userId, "financial_import.completed", "bank_statement_import", importId, null,
      { filename: input.filename, sourceType: input.parsed.sourceType, transactions: classified.length, reviewCount });
    return { duplicate: false, importId, status: reviewCount ? "needs_review" : "completed", transactionCount: classified.length, reviewCount };
  });
}

export async function getFinancialOverview(userId: string, tenantId: string, competence: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const [transactions, accounts, imports, month, categories, transfers] = await Promise.all([
      listTransactionsWithClient(client, tenantId, competence),
      client.query<FinancialAccountRow>(`select * from financial_accounts where tenant_id = $1 and active = true order by name`, [tenantId]),
      client.query(`select id, original_filename, source_type, status, transaction_row_count, credit_total_cents,
                           debit_total_cents, final_balance_cents, imported_at, financial_account_id
                    from bank_statement_imports where tenant_id = $1 and competence = $2 order by imported_at desc`, [tenantId, `${competence}-01`]),
      client.query<{ status: string; closing_notes: string | null }>(`select status, closing_notes from financial_months where tenant_id = $1 and competence = $2`, [tenantId, `${competence}-01`]),
      client.query<FinancialCategoryRow>(`select id, name, type, affects_operating_result from financial_categories where tenant_id = $1 and active = true order by name`, [tenantId]),
      client.query(`select m.*, outgoing.original_description as outgoing_description, incoming.original_description as incoming_description,
                           outgoing.amount_cents as amount_cents
                    from internal_transfer_matches m
                    join financial_transactions outgoing on outgoing.id = m.outgoing_transaction_id
                    join financial_transactions incoming on incoming.id = m.incoming_transaction_id
                    where m.tenant_id = $1 and outgoing.competence = $2 order by m.match_score desc`, [tenantId, `${competence}-01`])
    ]);
    const normalized = transactions.map((row) => ({
      amountCents: Number(row.amount_cents), direction: row.direction, nature: row.nature,
      includeExternalCashFlow: row.include_external_cash_flow,
      includeOperatingResult: row.include_operating_result,
      internalTransferConfirmed: row.transfer_status === "confirmed",
      reviewRequired: row.review_required, reviewStatus: row.review_status
    }));
    return {
      competence, month: month.rows[0] ?? { status: "open", closing_notes: null },
      metrics: calculateFinancialMetrics(normalized), accounts: accounts.rows,
      imports: imports.rows, transactions, categories: categories.rows, transfers: transfers.rows
    };
  });
}

export async function classifyFinancialTransactions(userId: string, tenantId: string, input: {
  transactionIds: string[]; nature: string; categoryId?: string | null;
  includeExternalCashFlow: boolean; includeOperatingResult: boolean; notes?: string;
  createRule?: { name: string; descriptionContains: string };
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    const before = await client.query(`select id, nature, category_id, include_external_cash_flow, include_operating_result
      from financial_transactions where tenant_id = $1 and id = any($2::uuid[])`, [tenantId, input.transactionIds]);
    if (before.rowCount !== input.transactionIds.length) throw new Error("Um ou mais lançamentos não pertencem a este tenant.");
    let ruleId: string | null = null;
    if (input.createRule) {
      const rule = await client.query<{ id: string }>(
        `insert into financial_classification_rules (
           tenant_id, priority, name, conditions, actions, created_from_transaction_id, created_by
         ) values ($1, 100, $2, $3, $4, $5, $6)
         on conflict (tenant_id, name) do update set conditions = excluded.conditions, actions = excluded.actions, updated_at = now()
         returning id`,
        [tenantId, input.createRule.name, JSON.stringify({ descriptionContains: input.createRule.descriptionContains }),
          JSON.stringify({ nature: input.nature, categoryId: input.categoryId ?? null,
            includeExternalCashFlow: input.includeExternalCashFlow, includeOperatingResult: input.includeOperatingResult,
            reviewRequired: false }), input.transactionIds[0], userId]
      );
      ruleId = rule.rows[0].id;
    }
    await client.query(
      `update financial_transactions set nature = $3, category_id = $4,
         include_external_cash_flow = $5, include_operating_result = $6,
         notes = nullif($7, ''), review_required = false, review_status = 'reviewed',
         classification_confidence = 1, classification_source = 'manual',
         classification_rule_id = coalesce($8, classification_rule_id), updated_at = now()
       where tenant_id = $1 and id = any($2::uuid[])`,
      [tenantId, input.transactionIds, input.nature, input.categoryId ?? null,
        input.includeExternalCashFlow, input.includeOperatingResult, input.notes ?? "", ruleId]
    );
    await audit(client, tenantId, userId, "financial_transaction.classify", "financial_transaction", input.transactionIds[0], before.rows, input);
    return { updated: input.transactionIds.length, ruleId };
  });
}

export async function setTransferStatus(userId: string, tenantId: string, matchId: string, status: "confirmed" | "rejected" | "cancelled") {
  return withTenantContext(userId, tenantId, async (client) => {
    const match = await client.query<{ outgoing_transaction_id: string; incoming_transaction_id: string }>(
      `update internal_transfer_matches set status = $3, confirmed_by = case when $3 = 'confirmed' then $4 else null end,
       confirmed_at = case when $3 = 'confirmed' then now() else null end
       where tenant_id = $1 and id = $2 returning outgoing_transaction_id, incoming_transaction_id`,
      [tenantId, matchId, status, userId]
    );
    if (!match.rows[0]) throw new Error("Sugestão de transferência não encontrada.");
    const ids = [match.rows[0].outgoing_transaction_id, match.rows[0].incoming_transaction_id];
    if (status === "confirmed") {
      await client.query(`update financial_transactions set internal_transfer_pair_id = $3, nature = 'internal_transfer',
        include_external_cash_flow = false, include_operating_result = false, review_required = false,
        review_status = 'reviewed', classification_source = 'transfer_match', updated_at = now()
        where tenant_id = $1 and id = any($2::uuid[])`, [tenantId, ids, matchId]);
    } else {
      await client.query(`update financial_transactions set internal_transfer_pair_id = null,
        nature = case when nature = 'internal_transfer' then 'unclassified' else nature end,
        include_external_cash_flow = true, review_required = true, review_status = 'pending', updated_at = now()
        where tenant_id = $1 and id = any($2::uuid[])`, [tenantId, ids]);
    }
    await audit(client, tenantId, userId, `financial_transfer.${status}`, "internal_transfer_match", matchId, null, { transactionIds: ids });
    return { id: matchId, status };
  });
}

export async function closeFinancialMonth(userId: string, tenantId: string, input: { competence: string; force: boolean; notes?: string }) {
  return withTenantContext(userId, tenantId, async (client) => {
    const checks = await client.query<{ missing_accounts: string; pending_reviews: string; failed_imports: string }>(
      `select
        (select count(*) from financial_accounts a where a.tenant_id = $1 and a.active and a.required_for_monthly_close
          and not exists (select 1 from bank_statement_imports i where i.tenant_id = a.tenant_id and i.financial_account_id = a.id and i.competence = $2 and i.status in ('needs_review','completed')))::text missing_accounts,
        (select count(*) from financial_transactions t where t.tenant_id = $1 and t.competence = $2 and t.review_required and t.review_status = 'pending')::text pending_reviews,
        (select count(*) from bank_statement_imports i where i.tenant_id = $1 and i.competence = $2 and i.status = 'failed')::text failed_imports`,
      [tenantId, `${input.competence}-01`]
    );
    const pending = checks.rows[0];
    const hasPending = Object.values(pending).some((value) => Number(value) > 0);
    if (hasPending && (!input.force || !input.notes?.trim())) {
      return { closed: false, requiresJustification: true, checks: pending };
    }
    await client.query(`insert into financial_months (tenant_id, competence, status, closing_notes, closed_by, closed_at)
      values ($1, $2, 'completed', $3, $4, now())
      on conflict (tenant_id, competence) do update set status = 'completed', closing_notes = excluded.closing_notes,
      closed_by = excluded.closed_by, closed_at = now(), updated_at = now()`,
      [tenantId, `${input.competence}-01`, input.notes ?? null, userId]
    );
    await audit(client, tenantId, userId, "financial_month.close", "financial_month", null, null, { competence: input.competence, checks: pending, force: input.force, notes: input.notes });
    return { closed: true, checks: pending };
  });
}

export async function reopenFinancialMonth(userId: string, tenantId: string, competence: string, notes: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    if (!notes.trim()) throw new Error("Informe o motivo da reabertura.");
    const result = await client.query(`update financial_months set status = 'reopened', closing_notes = $3,
      reopened_by = $4, reopened_at = now(), updated_at = now() where tenant_id = $1 and competence = $2`,
      [tenantId, `${competence}-01`, notes, userId]
    );
    if (!result.rowCount) throw new Error("Competência não encontrada.");
    await audit(client, tenantId, userId, "financial_month.reopen", "financial_month", null, null, { competence, notes });
    return { reopened: true };
  });
}

export async function getFinancialExportData(userId: string, tenantId: string, competence: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const overview = await getOverviewWithClient(client, tenantId, competence);
    const rules = await client.query(`select name, priority, source_type, conditions, actions, enabled from financial_classification_rules where tenant_id = $1 order by priority, name`, [tenantId]);
    const rawRows = await client.query(`select i.source_type, i.original_filename, r.source_line_number, r.raw_payload
      from bank_statement_raw_rows r join bank_statement_imports i on i.id = r.import_id
      where r.tenant_id = $1 and i.competence = $2 order by i.source_type, r.source_line_number`, [tenantId, `${competence}-01`]);
    return { ...overview, rules: rules.rows, rawRows: rawRows.rows };
  });
}

export async function getOriginalFinancialImport(userId: string, tenantId: string, importId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ original_filename: string; content_type: string; original_content: Buffer | null }>(
      `select original_filename, content_type, original_content
       from bank_statement_imports where tenant_id = $1 and id = $2 limit 1`,
      [tenantId, importId]
    );
    return result.rows[0] ?? null;
  });
}

async function getOverviewWithClient(client: pg.PoolClient, tenantId: string, competence: string) {
  const transactions = await listTransactionsWithClient(client, tenantId, competence);
  const imports = await client.query(`select original_filename, source_type, status, raw_row_count, transaction_row_count,
    duplicate_row_count, ignored_row_count, credit_total_cents, debit_total_cents, final_balance_cents, imported_at
    from bank_statement_imports where tenant_id = $1 and competence = $2 order by imported_at`, [tenantId, `${competence}-01`]);
  const metrics = calculateFinancialMetrics(transactions.map((row) => ({
    amountCents: Number(row.amount_cents), direction: row.direction, nature: row.nature,
    includeExternalCashFlow: row.include_external_cash_flow, includeOperatingResult: row.include_operating_result,
    internalTransferConfirmed: row.transfer_status === "confirmed", reviewRequired: row.review_required, reviewStatus: row.review_status
  })));
  return { competence, metrics, transactions, imports: imports.rows };
}

async function listTransactionsWithClient(client: pg.PoolClient, tenantId: string, competence: string) {
  const result = await client.query<FinancialTransactionRow>(
    `select t.id, t.transaction_date::text, t.competence::text, t.original_description, t.normalized_description,
      t.counterparty, t.amount_cents::text, t.direction, t.nature, t.include_external_cash_flow,
      t.include_operating_result, t.review_required, t.review_status, t.classification_confidence::text,
      t.classification_source, t.source_type, a.name account_name, a.id account_id,
      t.category_id, c.name category_name, m.status transfer_status, i.original_filename import_filename
    from financial_transactions t
    join financial_accounts a on a.id = t.financial_account_id and a.tenant_id = t.tenant_id
    join bank_statement_imports i on i.id = t.import_id and i.tenant_id = t.tenant_id
    left join financial_categories c on c.id = t.category_id and c.tenant_id = t.tenant_id
    left join internal_transfer_matches m on m.id = t.internal_transfer_pair_id and m.tenant_id = t.tenant_id
    where t.tenant_id = $1 and t.competence = $2
    order by t.transaction_date desc, t.created_at desc`,
    [tenantId, `${competence}-01`]
  );
  return result.rows;
}

async function loadRules(client: pg.PoolClient, tenantId: string): Promise<ClassificationRule[]> {
  const result = await client.query<ClassificationRule & { source_type: string | null }>(
    `select r.id, r.priority, r.source_type, r.conditions, r.actions ||
      case when c.id is null then '{}'::jsonb else jsonb_build_object('categoryId', c.id) end as actions
     from financial_classification_rules r
     left join financial_categories c on c.tenant_id = r.tenant_id and c.name = r.actions->>'categoryName'
     where r.tenant_id = $1 and r.enabled and r.auto_apply order by r.priority, r.created_at`, [tenantId]
  );
  return result.rows.map((row) => ({ ...row, sourceType: row.source_type }));
}

async function refreshTransferSuggestions(client: pg.PoolClient, tenantId: string, competence: string) {
  const result = await client.query<{
    id: string; account_id: string; transaction_date: string; amount_cents: string; currency: string;
    description: string; counterparty: string | null; same_economic_entity: boolean; ownership_type: string;
  }>(`select t.id, t.financial_account_id account_id, t.transaction_date::text, t.amount_cents::text,
       t.currency, t.original_description description, t.counterparty, a.same_economic_entity, a.ownership_type
      from financial_transactions t join financial_accounts a on a.id = t.financial_account_id
      where t.tenant_id = $1 and t.competence = $2 and t.direction <> 'neutral' and t.internal_transfer_pair_id is null`,
    [tenantId, competence]
  );
  const suggestions = suggestInternalTransfers(result.rows.map((row) => ({ ...row, accountId: row.account_id,
    amountCents: Number(row.amount_cents), transactionDate: row.transaction_date,
    sameEconomicEntity: row.same_economic_entity, ownershipType: row.ownership_type })));
  for (const suggestion of suggestions) {
    const status = suggestion.requiresConfirmation ? "suggested" : "confirmed";
    const match = await client.query<{ id: string }>(`insert into internal_transfer_matches (
      tenant_id, outgoing_transaction_id, incoming_transaction_id, match_score, match_method, status, confirmed_at
    ) values ($1,$2,$3,$4,$5,$6,case when $6 = 'confirmed' then now() else null end)
      on conflict (tenant_id, outgoing_transaction_id, incoming_transaction_id) do update
      set match_score = excluded.match_score returning id`,
      [tenantId, suggestion.outgoingTransactionId, suggestion.incomingTransactionId, suggestion.score,
        JSON.stringify({ reasons: suggestion.reasons, requiresConfirmation: suggestion.requiresConfirmation }), status]
    );
    if (status === "confirmed") {
      await client.query(`update financial_transactions set internal_transfer_pair_id = $3,
        nature = 'internal_transfer', include_external_cash_flow = false, include_operating_result = false,
        review_required = false, review_status = 'reviewed', classification_source = 'transfer_match', updated_at = now()
        where tenant_id = $1 and id = any($2::uuid[])`,
        [tenantId, [suggestion.outgoingTransactionId, suggestion.incomingTransactionId], match.rows[0].id]
      );
    }
  }
}

function findSourceIdentifier(values: Record<string, string>) {
  return values.Identificador || values.REFERENCE_ID || values["ID da transação"] || null;
}

async function audit(client: pg.PoolClient, tenantId: string, userId: string, action: string, entityType: string,
  entityId: string | null, before: unknown, after: unknown) {
  await client.query(`insert into financial_audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, userId, action, entityType, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
  );
}
