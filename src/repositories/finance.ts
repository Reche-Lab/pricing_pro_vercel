import type pg from "pg";
import { classifyTransactions, ruleMatchesTransaction } from "@/domain/finance/classification";
import { randomUUID } from "node:crypto";
import { sha256 } from "@/domain/finance/csv";
import { calculateFinancialMetrics } from "@/domain/finance/metrics";
import {
  createFinancialIndicatorResolver,
  validateFinancialIndicatorVersions,
  FinancialIndicatorError,
  type FinancialIndicatorComponentResult,
  type FinancialIndicatorFormula,
  type FinancialIndicatorUnit
} from "@/domain/finance/indicators";
import { calculateFinancialHealth } from "@/domain/finance/health";
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
  source_line_number: number;
  source_identifier: string | null;
  raw_payload: Record<string, unknown>;
  nature_name: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  category_name: string | null;
  category_parent_name: string | null;
  subcategory_name: string | null;
  transfer_status: string | null;
  transfer_key: string | null;
  notes: string | null;
  import_filename: string;
};

export type FinancialCategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  type: "income" | "expense" | "neutral";
  affects_operating_result: boolean;
  active: boolean;
  olist_category_id: string | null;
  transaction_count: string;
  active_children_count: string;
};

export type FinancialNatureRow = {
  id: string;
  key: string;
  name: string;
  type: "income" | "expense" | "neutral";
  default_include_external_cash_flow: boolean;
  default_include_operating_result: boolean;
  protected: boolean;
  active: boolean;
  transaction_count: string;
};

export type FinancialRuleRow = {
  id: string;
  name: string;
  priority: number;
  source_type: string | null;
  financial_account_id: string | null;
  account_name: string | null;
  conditions: ClassificationRule["conditions"];
  actions: ClassificationRule["actions"];
  enabled: boolean;
  auto_apply: boolean;
  updated_at: string;
};

export type FinancialRuleInput = {
  name: string;
  priority: number;
  sourceType?: string | null;
  financialAccountId?: string | null;
  conditions: ClassificationRule["conditions"];
  actions: ClassificationRule["actions"];
  enabled: boolean;
  autoApply: boolean;
};

export type FinancialIndicatorView = {
  id: string;
  name: string;
  description: string | null;
  unit: FinancialIndicatorUnit;
  sort_order: number;
  active: boolean;
  version_id: string;
  version: number;
  effective_from: string;
  formula: FinancialIndicatorFormula;
  value: number;
  component_results: FinancialIndicatorComponentResult[];
  frozen_at: string | null;
  is_frozen: boolean;
};

export type FinancialIndicatorInput = {
  name: string;
  description?: string | null;
  unit: FinancialIndicatorUnit;
  sortOrder?: number;
  active?: boolean;
  effectiveFrom: string;
  formula: FinancialIndicatorFormula;
};

export async function listFinancialNatures(userId: string, tenantId: string, includeInactive = true) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<FinancialNatureRow>(
      `select n.id, n.key, n.name, n.type, n.default_include_external_cash_flow,
              n.default_include_operating_result, n.protected, n.active,
              count(t.id)::text transaction_count
       from financial_natures n
       left join financial_transactions t on t.tenant_id = n.tenant_id and t.nature = n.key
       where n.tenant_id = $1 and ($2::boolean or n.active)
       group by n.id order by n.active desc, n.name`, [tenantId, includeInactive]
    );
    return result.rows;
  });
}

export async function createFinancialNature(userId: string, tenantId: string, input: {
  name: string; type: "income" | "expense" | "neutral";
  defaultIncludeExternalCashFlow: boolean; defaultIncludeOperatingResult: boolean;
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    const duplicate = await client.query(`select id from financial_natures where tenant_id = $1 and lower(name) = lower($2) limit 1`, [tenantId, input.name]);
    if (duplicate.rows[0]) throw new Error("Já existe uma natureza com este nome.");
    const base = input.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "natureza";
    const key = `${base}_${randomUUID().slice(0, 6)}`;
    const result = await client.query<FinancialNatureRow>(
      `insert into financial_natures (
         tenant_id, key, name, type, default_include_external_cash_flow, default_include_operating_result
       ) values ($1,$2,$3,$4,$5,$6)
       returning id, key, name, type, default_include_external_cash_flow,
         default_include_operating_result, protected, active, '0'::text transaction_count`,
      [tenantId, key, input.name, input.type, input.defaultIncludeExternalCashFlow, input.defaultIncludeOperatingResult]
    );
    await audit(client, tenantId, userId, "financial_nature.create", "financial_nature", result.rows[0].id, null, result.rows[0]);
    return result.rows[0];
  });
}

export async function updateFinancialNature(userId: string, tenantId: string, natureId: string, input: {
  name: string; type: "income" | "expense" | "neutral";
  defaultIncludeExternalCashFlow: boolean; defaultIncludeOperatingResult: boolean; active?: boolean;
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    const before = await client.query<FinancialNatureRow>(
      `select id, key, name, type, default_include_external_cash_flow, default_include_operating_result,
         protected, active, '0'::text transaction_count from financial_natures where tenant_id = $1 and id = $2 limit 1`,
      [tenantId, natureId]
    );
    if (!before.rows[0]) throw new Error("Natureza financeira não encontrada.");
    const duplicate = await client.query(`select id from financial_natures where tenant_id = $1 and id <> $2 and lower(name) = lower($3) limit 1`, [tenantId, natureId, input.name]);
    if (duplicate.rows[0]) throw new Error("Já existe uma natureza com este nome.");
    const result = await client.query<FinancialNatureRow>(
      `update financial_natures set name = $3, type = $4,
         default_include_external_cash_flow = $5, default_include_operating_result = $6,
         active = coalesce($7, active), updated_at = now()
       where tenant_id = $1 and id = $2
       returning id, key, name, type, default_include_external_cash_flow,
         default_include_operating_result, protected, active, '0'::text transaction_count`,
      [tenantId, natureId, input.name, input.type, input.defaultIncludeExternalCashFlow,
        input.defaultIncludeOperatingResult, input.active ?? null]
    );
    await audit(client, tenantId, userId, "financial_nature.update", "financial_nature", natureId, before.rows[0], result.rows[0]);
    return result.rows[0];
  });
}

export async function deactivateFinancialNature(userId: string, tenantId: string, natureId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const before = await client.query<FinancialNatureRow>(
      `select n.id, n.key, n.name, n.type, n.default_include_external_cash_flow,
         n.default_include_operating_result, n.protected, n.active,
         (select count(*)::text from financial_transactions t where t.tenant_id = n.tenant_id and t.nature = n.key) transaction_count
       from financial_natures n where n.tenant_id = $1 and n.id = $2 limit 1`, [tenantId, natureId]
    );
    const nature = before.rows[0];
    if (!nature) throw new Error("Natureza financeira não encontrada.");
    if (nature.protected) throw new Error("Esta natureza é necessária para o processamento financeiro e não pode ser excluída.");
    await client.query(`update financial_natures set active = false, updated_at = now() where tenant_id = $1 and id = $2`, [tenantId, natureId]);
    await client.query(`update financial_classification_rules set enabled = false, updated_at = now()
      where tenant_id = $1 and actions->>'nature' = $2`, [tenantId, nature.key]);
    await audit(client, tenantId, userId, "financial_nature.deactivate", "financial_nature", natureId, nature, { ...nature, active: false });
    return { deactivated: true, preservedTransactions: Number(nature.transaction_count) };
  });
}

export async function listFinancialCategories(userId: string, tenantId: string, includeInactive = true) {
  return withTenantContext(userId, tenantId, async (client) => {
    await ensureDefaultCategories(client, tenantId);
    const result = await client.query<FinancialCategoryRow>(
      `select c.id, c.parent_id, c.name, c.type, c.affects_operating_result, c.active,
              c.olist_category_id,
              count(distinct t.id)::text as transaction_count,
              count(distinct child.id) filter (where child.active)::text as active_children_count
       from financial_categories c
       left join financial_transactions t on t.tenant_id = c.tenant_id
         and (t.category_id = c.id or t.subcategory_id = c.id)
       left join financial_categories child on child.tenant_id = c.tenant_id and child.parent_id = c.id
       where c.tenant_id = $1 and ($2::boolean or c.active)
       group by c.id
       order by c.active desc, c.parent_id nulls first, c.name`,
      [tenantId, includeInactive]
    );
    return result.rows;
  });
}

export async function createFinancialCategory(userId: string, tenantId: string, input: {
  name: string; type: "income" | "expense" | "neutral"; parentId?: string | null;
  affectsOperatingResult: boolean; olistCategoryId?: string | null;
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    await validateCategoryParent(client, tenantId, input.parentId ?? null, input.type);
    const duplicate = await client.query(
      `select id from financial_categories
       where tenant_id = $1 and parent_id is not distinct from $2::uuid and lower(name) = lower($3) limit 1`,
      [tenantId, input.parentId ?? null, input.name]
    );
    if (duplicate.rows[0]) throw new Error("Já existe uma categoria com este nome no mesmo nível.");
    const result = await client.query<FinancialCategoryRow>(
      `insert into financial_categories (
         tenant_id, parent_id, name, type, affects_operating_result, olist_category_id
       ) values ($1,$2,$3,$4,$5,$6)
       returning id, parent_id, name, type, affects_operating_result, active, olist_category_id,
         '0'::text transaction_count, '0'::text active_children_count`,
      [tenantId, input.parentId ?? null, input.name, input.type, input.affectsOperatingResult, input.olistCategoryId ?? null]
    );
    await audit(client, tenantId, userId, "financial_category.create", "financial_category", result.rows[0].id, null, result.rows[0]);
    return result.rows[0];
  });
}

export async function updateFinancialCategory(userId: string, tenantId: string, categoryId: string, input: {
  name: string; type: "income" | "expense" | "neutral"; parentId?: string | null;
  affectsOperatingResult: boolean; olistCategoryId?: string | null; active?: boolean;
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    if (categoryId === input.parentId) throw new Error("Uma categoria não pode ser subordinada a ela mesma.");
    const before = await client.query<FinancialCategoryRow>(
      `select id, parent_id, name, type, affects_operating_result, active, olist_category_id,
         '0'::text transaction_count, '0'::text active_children_count
       from financial_categories where tenant_id = $1 and id = $2 limit 1`, [tenantId, categoryId]
    );
    if (!before.rows[0]) throw new Error("Categoria financeira não encontrada.");
    const children = await client.query<{ count: string }>(
      `select count(*)::text count from financial_categories where tenant_id = $1 and parent_id = $2 and active`,
      [tenantId, categoryId]
    );
    if (Number(children.rows[0]?.count) > 0 && input.parentId) {
      throw new Error("Uma categoria com subcategorias não pode se tornar subcategoria.");
    }
    if (Number(children.rows[0]?.count) > 0 && before.rows[0].type !== input.type) {
      throw new Error("Altere ou mova as subcategorias antes de mudar o tipo desta categoria.");
    }
    await validateCategoryParent(client, tenantId, input.parentId ?? null, input.type);
    const duplicate = await client.query(
      `select id from financial_categories where tenant_id = $1 and id <> $2
       and parent_id is not distinct from $3::uuid and lower(name) = lower($4) limit 1`,
      [tenantId, categoryId, input.parentId ?? null, input.name]
    );
    if (duplicate.rows[0]) throw new Error("Já existe uma categoria com este nome no mesmo nível.");
    const result = await client.query<FinancialCategoryRow>(
      `update financial_categories set parent_id = $3, name = $4, type = $5,
         affects_operating_result = $6, olist_category_id = $7,
         active = coalesce($8, active), updated_at = now()
       where tenant_id = $1 and id = $2
       returning id, parent_id, name, type, affects_operating_result, active, olist_category_id,
         '0'::text transaction_count, '0'::text active_children_count`,
      [tenantId, categoryId, input.parentId ?? null, input.name, input.type,
        input.affectsOperatingResult, input.olistCategoryId ?? null, input.active ?? null]
    );
    await audit(client, tenantId, userId, "financial_category.update", "financial_category", categoryId, before.rows[0], result.rows[0]);
    return result.rows[0];
  });
}

export async function deactivateFinancialCategory(userId: string, tenantId: string, categoryId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const before = await client.query<FinancialCategoryRow>(
      `select c.id, c.parent_id, c.name, c.type, c.affects_operating_result, c.active, c.olist_category_id,
         (select count(*)::text from financial_transactions t where t.tenant_id = c.tenant_id and (t.category_id = c.id or t.subcategory_id = c.id)) transaction_count,
         (select count(*)::text from financial_categories child where child.tenant_id = c.tenant_id and child.parent_id = c.id and child.active) active_children_count
       from financial_categories c where c.tenant_id = $1 and c.id = $2 limit 1`, [tenantId, categoryId]
    );
    const category = before.rows[0];
    if (!category) throw new Error("Categoria financeira não encontrada.");
    if (Number(category.active_children_count) > 0) throw new Error("Desative ou mova as subcategorias antes de excluir esta categoria.");
    await client.query(`update financial_categories set active = false, updated_at = now() where tenant_id = $1 and id = $2`, [tenantId, categoryId]);
    await client.query(`update financial_classification_rules set enabled = false, updated_at = now()
      where tenant_id = $1 and actions->>'categoryId' = $2`, [tenantId, categoryId]);
    await audit(client, tenantId, userId, "financial_category.deactivate", "financial_category", categoryId, category, { ...category, active: false });
    return { deactivated: true, preservedTransactions: Number(category.transaction_count) };
  });
}

async function validateCategoryParent(client: pg.PoolClient, tenantId: string, parentId: string | null, type: string) {
  if (!parentId) return;
  const parent = await client.query<{ id: string; parent_id: string | null; type: string; active: boolean }>(
    `select id, parent_id, type, active from financial_categories where tenant_id = $1 and id = $2 limit 1`,
    [tenantId, parentId]
  );
  if (!parent.rows[0] || !parent.rows[0].active) throw new Error("Categoria principal não encontrada ou inativa.");
  if (parent.rows[0].parent_id) throw new Error("A estrutura permite somente categoria e subcategoria.");
  if (parent.rows[0].type !== type) throw new Error("A subcategoria deve ter o mesmo tipo da categoria principal.");
}

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

export async function listFinancialRules(userId: string, tenantId: string) {
  return withTenantContext(userId, tenantId, async (client) => listRulesWithClient(client, tenantId));
}

export async function createFinancialRule(userId: string, tenantId: string, input: FinancialRuleInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    await validateRuleReferences(client, tenantId, input);
    const result = await client.query<{ id: string }>(
      `insert into financial_classification_rules (
         tenant_id, scope, priority, name, financial_account_id, source_type, conditions, actions,
         enabled, auto_apply, created_by
       ) values ($1,'tenant',$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [tenantId, input.priority, input.name, input.financialAccountId ?? null, input.sourceType ?? null,
        JSON.stringify(input.conditions), JSON.stringify(input.actions), input.enabled, input.autoApply, userId]
    );
    await audit(client, tenantId, userId, "financial_rule.create", "financial_classification_rule", result.rows[0].id, null, input);
    return (await listRulesWithClient(client, tenantId)).find((rule) => rule.id === result.rows[0].id)!;
  });
}

export async function updateFinancialRule(userId: string, tenantId: string, ruleId: string, input: FinancialRuleInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    await validateRuleReferences(client, tenantId, input);
    const before = await client.query(`select * from financial_classification_rules where tenant_id = $1 and id = $2`, [tenantId, ruleId]);
    if (!before.rows[0]) throw new Error("Regra automática não encontrada.");
    await client.query(
      `update financial_classification_rules set priority=$3, name=$4, financial_account_id=$5,
         source_type=$6, conditions=$7, actions=$8, enabled=$9, auto_apply=$10, updated_at=now()
       where tenant_id=$1 and id=$2`,
      [tenantId, ruleId, input.priority, input.name, input.financialAccountId ?? null, input.sourceType ?? null,
        JSON.stringify(input.conditions), JSON.stringify(input.actions), input.enabled, input.autoApply]
    );
    await audit(client, tenantId, userId, "financial_rule.update", "financial_classification_rule", ruleId, before.rows[0], input);
    return (await listRulesWithClient(client, tenantId)).find((rule) => rule.id === ruleId)!;
  });
}

export async function deactivateFinancialRule(userId: string, tenantId: string, ruleId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query(`update financial_classification_rules set enabled=false, updated_at=now()
      where tenant_id=$1 and id=$2 returning id, name`, [tenantId, ruleId]);
    if (!result.rows[0]) throw new Error("Regra automática não encontrada.");
    await audit(client, tenantId, userId, "financial_rule.deactivate", "financial_classification_rule", ruleId, result.rows[0], { enabled: false });
    return { deactivated: true };
  });
}

export async function simulateFinancialRule(userId: string, tenantId: string, competence: string, input: FinancialRuleInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    await validateRuleReferences(client, tenantId, input);
    const transactions = await listTransactionsWithClient(client, tenantId, competence);
    const rule = toClassificationRule("simulation", input);
    const matches = transactions.filter((row) => (!input.financialAccountId || row.account_id === input.financialAccountId)
      && (!input.sourceType || row.source_type === input.sourceType)
      && ruleMatchesTransaction(toNormalizedTransaction(row), rule));
    return {
      count: matches.length,
      totalCents: matches.reduce((sum, row) => sum + Math.abs(Number(row.amount_cents)), 0),
      samples: matches.slice(0, 5).map((row) => ({ id: row.id, date: row.transaction_date,
        description: row.original_description, amountCents: Number(row.amount_cents), accountName: row.account_name }))
    };
  });
}

export async function applyFinancialRule(userId: string, tenantId: string, ruleId: string, competence: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const rows = await listRulesWithClient(client, tenantId);
    const row = rows.find((item) => item.id === ruleId);
    if (!row) throw new Error("Regra automática não encontrada.");
    const transactions = await listTransactionsWithClient(client, tenantId, competence);
    const rule = toClassificationRule(row.id, {
      name: row.name, priority: row.priority, sourceType: row.source_type,
      financialAccountId: row.financial_account_id, conditions: row.conditions, actions: row.actions,
      enabled: row.enabled, autoApply: row.auto_apply
    });
    const ids = transactions.filter((transaction) => !["manual", "transfer_match"].includes(transaction.classification_source)
      && transaction.nature !== "informative"
      && (!row.financial_account_id || transaction.account_id === row.financial_account_id)
      && (!row.source_type || transaction.source_type === row.source_type)
      && ruleMatchesTransaction(toNormalizedTransaction(transaction), rule)).map((transaction) => transaction.id);
    if (ids.length) {
      await client.query(`update financial_transactions set nature=$3, category_id=$4,
        include_external_cash_flow=$5, include_operating_result=$6, review_required=$7,
        review_status=case when $7 then 'pending' else 'reviewed' end,
        classification_confidence=case when $7 then 0.7 else 1 end,
        classification_source='rule', classification_rule_id=$8, updated_at=now()
        where tenant_id=$1 and id=any($2::uuid[])`, [tenantId, ids, row.actions.nature,
        row.actions.categoryId ?? null, row.actions.includeExternalCashFlow ?? true,
        row.actions.includeOperatingResult ?? false, row.actions.reviewRequired ?? false, ruleId]);
    }
    await audit(client, tenantId, userId, "financial_rule.apply", "financial_classification_rule", ruleId, null, { competence, updated: ids.length });
    return { updated: ids.length };
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

    const rules = await loadRules(client, input.tenantId, input.accountId);
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
    const [transactions, accounts, imports, month, categories, natures, transfers] = await Promise.all([
      listTransactionsWithClient(client, tenantId, competence),
      client.query<FinancialAccountRow>(`select * from financial_accounts where tenant_id = $1 and active = true order by name`, [tenantId]),
      client.query(`select id, original_filename, source_type, status, transaction_row_count, credit_total_cents,
                           debit_total_cents, initial_balance_cents, final_balance_cents, calculated_balance_cents,
                           error_message, metadata, imported_at, financial_account_id
                    from bank_statement_imports where tenant_id = $1 and competence = $2 order by imported_at desc`, [tenantId, `${competence}-01`]),
      client.query<{ status: string; closing_notes: string | null }>(`select status, closing_notes from financial_months where tenant_id = $1 and competence = $2`, [tenantId, `${competence}-01`]),
      client.query<FinancialCategoryRow>(`select id, parent_id, name, type, affects_operating_result from financial_categories where tenant_id = $1 and active = true order by name`, [tenantId]),
      client.query<FinancialNatureRow>(`select id, key, name, type, default_include_external_cash_flow,
        default_include_operating_result, protected, active, '0'::text transaction_count
        from financial_natures where tenant_id = $1 and active = true order by name`, [tenantId]),
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
    const requiredAccounts = accounts.rows.filter((account) => account.required_for_monthly_close);
    const validImportAccounts = new Set(imports.rows.filter((item) => ["needs_review", "completed"].includes(String(item.status)))
      .map((item) => String(item.financial_account_id)));
    const health = calculateFinancialHealth({
      requiredAccounts: requiredAccounts.length,
      missingAccounts: requiredAccounts.filter((account) => !validImportAccounts.has(account.id)).length,
      failedImports: imports.rows.filter((item) => item.status === "failed").length,
      importsNeedingReview: imports.rows.filter((item) => item.status === "needs_review").length,
      balanceMismatches: imports.rows.filter((item) => item.final_balance_cents !== null && item.calculated_balance_cents !== null
        && Number(item.final_balance_cents) !== Number(item.calculated_balance_cents)).length,
      pendingReviews: normalized.filter((item) => item.reviewRequired && item.reviewStatus === "pending").length,
      unclassifiedTransactions: normalized.filter((item) => item.nature === "unclassified").length,
      suggestedTransfers: transfers.rows.filter((item) => item.status === "suggested").length
    });
    const indicators = await listFinancialIndicatorsWithClient(
      client,
      tenantId,
      competence,
      transactions,
      month.rows[0]?.status === "completed"
    );
    return {
      competence, month: month.rows[0] ?? { status: "open", closing_notes: null },
      metrics: calculateFinancialMetrics(normalized), accounts: accounts.rows,
      imports: imports.rows, transactions, categories: categories.rows, natures: natures.rows,
      transfers: transfers.rows, indicators, health
    };
  });
}

export async function getFinancialComparison(userId: string, tenantId: string, endCompetence: string, months: number) {
  return withTenantContext(userId, tenantId, async (client) => {
    const end = `${endCompetence}-01`;
    const series = await client.query<{
      competence: string; external_inflows_cents: string; external_outflows_cents: string;
      operating_result_cents: string; transaction_count: string; pending_count: string;
    }>(`with periods as (
        select generate_series($2::date - (($3::int - 1) * interval '1 month'), $2::date, interval '1 month')::date competence
      ) select p.competence::text,
        coalesce(sum(case when t.include_external_cash_flow and t.amount_cents > 0 and coalesce(m.status,'') <> 'confirmed' then t.amount_cents else 0 end),0)::text external_inflows_cents,
        coalesce(abs(sum(case when t.include_external_cash_flow and t.amount_cents < 0 and coalesce(m.status,'') <> 'confirmed' then t.amount_cents else 0 end)),0)::text external_outflows_cents,
        coalesce(sum(case when t.include_operating_result then t.amount_cents else 0 end),0)::text operating_result_cents,
        count(t.id) filter (where t.direction <> 'neutral')::text transaction_count,
        count(t.id) filter (where (t.review_required and t.review_status='pending') or t.nature='unclassified')::text pending_count
      from periods p left join financial_transactions t on t.tenant_id=$1 and t.competence=p.competence
      left join internal_transfer_matches m on m.id=t.internal_transfer_pair_id and m.tenant_id=t.tenant_id
      group by p.competence order by p.competence`, [tenantId, end, months]);
    const categoryRows = await client.query<{ category_name: string; amount_cents: string }>(
      `select coalesce(c.name,'Sem categoria') category_name,
        sum(t.amount_cents)::text amount_cents
       from financial_transactions t left join financial_categories c on c.id=t.category_id and c.tenant_id=t.tenant_id
       where t.tenant_id=$1 and t.competence between ($2::date - (($3::int - 1) * interval '1 month')) and $2::date
         and t.include_operating_result
       group by coalesce(c.name,'Sem categoria') order by abs(sum(t.amount_cents)) desc limit 8`, [tenantId, end, months]);
    return {
      endCompetence, months,
      series: series.rows.map((row) => ({ competence: row.competence.slice(0, 7),
        externalInflowsCents: Number(row.external_inflows_cents), externalOutflowsCents: Number(row.external_outflows_cents),
        operatingResultCents: Number(row.operating_result_cents), transactionCount: Number(row.transaction_count),
        pendingCount: Number(row.pending_count) })),
      categories: categoryRows.rows.map((row) => ({ name: row.category_name, amountCents: Number(row.amount_cents) }))
    };
  });
}

export async function listFinancialIndicators(userId: string, tenantId: string, competence: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const transactions = await listTransactionsWithClient(client, tenantId, competence);
    const month = await client.query<{ status: string }>(
      `select status from financial_months where tenant_id = $1 and competence = $2 limit 1`,
      [tenantId, `${competence}-01`]
    );
    return listFinancialIndicatorsWithClient(
      client,
      tenantId,
      competence,
      transactions,
      month.rows[0]?.status === "completed"
    );
  });
}

export async function previewFinancialIndicator(
  userId: string,
  tenantId: string,
  competence: string,
  unit: FinancialIndicatorUnit,
  formula: FinancialIndicatorFormula,
  indicatorId?: string
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await validateIndicatorReferences(client, tenantId, unit, formula);
    const transactions = await listTransactionsWithClient(client, tenantId, competence);
    const indicators = await listFinancialIndicatorsWithClient(client, tenantId, competence, transactions, false, true);
    const previewId = indicatorId ?? "preview";
    const resolve = createFinancialIndicatorResolver([
      ...indicators.filter((item) => item.id !== previewId).map((item) => ({
        id: item.id, name: item.name, unit: item.unit, formula: item.formula, versionId: item.version_id
      })),
      { id: previewId, name: "Prévia", unit, formula }
    ], transactions.map(toIndicatorTransaction));
    return resolve(previewId);
  });
}

export async function createFinancialIndicator(userId: string, tenantId: string, input: FinancialIndicatorInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 59))", [tenantId]);
    await validateIndicatorReferences(client, tenantId, input.unit, input.formula);
    await validateIndicatorDependencies(client, tenantId, input);
    const existing = await client.query(`select id from financial_indicators where tenant_id=$1 and lower(name)=lower($2)`, [tenantId, input.name]);
    if (existing.rows[0]) throw new Error("Já existe um indicador com este nome.");
    const indicator = await client.query<{ id: string }>(
      `insert into financial_indicators (tenant_id, name, description, unit, sort_order, active, created_by)
       values ($1,$2,nullif($3,''),$4,$5,$6,$7) returning id`,
      [tenantId, input.name, input.description ?? "", input.unit, input.sortOrder ?? 0, input.active ?? true, userId]
    );
    const version = await client.query<{ id: string }>(
      `insert into financial_indicator_versions (tenant_id, indicator_id, version, effective_from, formula, created_by)
       values ($1,$2,1,$3,$4,$5) returning id`,
      [tenantId, indicator.rows[0].id, `${input.effectiveFrom}-01`, JSON.stringify(input.formula), userId]
    );
    await audit(client, tenantId, userId, "financial_indicator.create", "financial_indicator", indicator.rows[0].id, null, {
      ...input, versionId: version.rows[0].id
    });
    return { id: indicator.rows[0].id, versionId: version.rows[0].id };
  });
}

export async function updateFinancialIndicator(
  userId: string,
  tenantId: string,
  indicatorId: string,
  input: FinancialIndicatorInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 59))", [tenantId]);
    await validateIndicatorReferences(client, tenantId, input.unit, input.formula);
    await validateIndicatorDependencies(client, tenantId, input, indicatorId);
    const before = await client.query(
      `select i.*, v.id version_id, v.version, v.effective_from::text, v.formula
       from financial_indicators i join lateral (
         select * from financial_indicator_versions where tenant_id=i.tenant_id and indicator_id=i.id
         order by version desc limit 1
       ) v on true where i.tenant_id=$1 and i.id=$2`,
      [tenantId, indicatorId]
    );
    if (!before.rows[0]) throw new Error("Indicador não encontrado.");
    const duplicate = await client.query(
      `select id from financial_indicators where tenant_id=$1 and lower(name)=lower($2) and id<>$3`,
      [tenantId, input.name, indicatorId]
    );
    if (duplicate.rows[0]) throw new Error("Já existe um indicador com este nome.");
    await client.query(
      `update financial_indicators set name=$3, description=nullif($4,''), unit=$5, sort_order=$6,
       active=$7, updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, indicatorId, input.name, input.description ?? "", input.unit,
        input.sortOrder ?? before.rows[0].sort_order, input.active ?? true]
    );
    const version = await client.query<{ id: string; version: number }>(
      `insert into financial_indicator_versions (tenant_id, indicator_id, version, effective_from, formula, created_by)
       select $1,$2,coalesce(max(version),0)+1,$3,$4,$5
       from financial_indicator_versions where tenant_id=$1 and indicator_id=$2
       returning id, version`,
      [tenantId, indicatorId, `${input.effectiveFrom}-01`, JSON.stringify(input.formula), userId]
    );
    await audit(client, tenantId, userId, "financial_indicator.update", "financial_indicator", indicatorId, before.rows[0], {
      ...input, versionId: version.rows[0].id, version: version.rows[0].version
    });
    return { id: indicatorId, versionId: version.rows[0].id, version: version.rows[0].version };
  });
}

export async function deactivateFinancialIndicator(userId: string, tenantId: string, indicatorId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const before = await client.query(`select * from financial_indicators where tenant_id=$1 and id=$2`, [tenantId, indicatorId]);
    if (!before.rows[0]) throw new Error("Indicador não encontrado.");
    await client.query(`update financial_indicators set active=false, updated_at=now() where tenant_id=$1 and id=$2`, [tenantId, indicatorId]);
    await audit(client, tenantId, userId, "financial_indicator.deactivate", "financial_indicator", indicatorId, before.rows[0], { active: false });
    return { id: indicatorId, active: false };
  });
}

export async function classifyFinancialTransactions(userId: string, tenantId: string, input: {
  transactionIds: string[]; nature: string; categoryId?: string | null;
  includeExternalCashFlow: boolean; includeOperatingResult: boolean; notes?: string;
  createRule?: { name: string; descriptionContains: string };
}) {
  return withTenantContext(userId, tenantId, async (client) => {
    const nature = await client.query(`select id from financial_natures where tenant_id = $1 and key = $2 and active limit 1`, [tenantId, input.nature]);
    if (!nature.rows[0]) throw new Error("Natureza financeira não encontrada ou inativa.");
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
    const checks = await client.query<{ missing_accounts: string; pending_reviews: string; failed_imports: string; balance_mismatches: string }>(
      `select
        (select count(*) from financial_accounts a where a.tenant_id = $1 and a.active and a.required_for_monthly_close
          and not exists (select 1 from bank_statement_imports i where i.tenant_id = a.tenant_id and i.financial_account_id = a.id and i.competence = $2 and i.status in ('needs_review','completed')))::text missing_accounts,
        (select count(*) from financial_transactions t where t.tenant_id = $1 and t.competence = $2 and t.review_required and t.review_status = 'pending')::text pending_reviews,
        (select count(*) from bank_statement_imports i where i.tenant_id = $1 and i.competence = $2 and i.status = 'failed')::text failed_imports,
        (select count(*) from bank_statement_imports i where i.tenant_id = $1 and i.competence = $2
          and i.final_balance_cents is not null and i.calculated_balance_cents is not null
          and i.final_balance_cents <> i.calculated_balance_cents)::text balance_mismatches`,
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
    await freezeFinancialIndicators(client, tenantId, input.competence);
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
  const month = await client.query<{ status: string }>(
    `select status from financial_months where tenant_id = $1 and competence = $2 limit 1`,
    [tenantId, `${competence}-01`]
  );
  const indicators = await listFinancialIndicatorsWithClient(
    client,
    tenantId,
    competence,
    transactions,
    month.rows[0]?.status === "completed"
  );
  return { competence, metrics, transactions, imports: imports.rows, indicators };
}

async function listTransactionsWithClient(client: pg.PoolClient, tenantId: string, competence: string) {
  const result = await client.query<FinancialTransactionRow>(
    `select t.id, t.transaction_date::text, t.competence::text, t.original_description, t.normalized_description,
      t.counterparty, t.amount_cents::text, t.direction, t.nature, t.include_external_cash_flow,
      t.include_operating_result, t.review_required, t.review_status, t.classification_confidence::text,
      t.classification_source, t.source_type, a.name account_name, a.id account_id,
      r.source_line_number, coalesce(t.source_identifier, r.source_identifier) source_identifier,
      r.raw_payload, n.name nature_name,
      t.category_id, t.subcategory_id, c.name category_name, cp.name category_parent_name,
      coalesce(sc.name, case when c.parent_id is not null then c.name end) subcategory_name,
      m.status transfer_status,
      case when m.id is not null then 'TRF-' || upper(substr(replace(m.id::text, '-', ''), 1, 16)) end transfer_key,
      t.notes, i.original_filename import_filename
    from financial_transactions t
    join financial_accounts a on a.id = t.financial_account_id and a.tenant_id = t.tenant_id
    join bank_statement_imports i on i.id = t.import_id and i.tenant_id = t.tenant_id
    join bank_statement_raw_rows r on r.id = t.raw_row_id and r.tenant_id = t.tenant_id
    left join financial_natures n on n.tenant_id = t.tenant_id and n.key = t.nature
    left join financial_categories c on c.id = t.category_id and c.tenant_id = t.tenant_id
    left join financial_categories cp on cp.id = c.parent_id and cp.tenant_id = c.tenant_id
    left join financial_categories sc on sc.id = t.subcategory_id and sc.tenant_id = t.tenant_id
    left join internal_transfer_matches m on m.id = t.internal_transfer_pair_id and m.tenant_id = t.tenant_id
    where t.tenant_id = $1 and t.competence = $2
    order by t.transaction_date desc, t.created_at desc`,
    [tenantId, `${competence}-01`]
  );
  return result.rows;
}

async function listFinancialIndicatorsWithClient(
  client: pg.PoolClient,
  tenantId: string,
  competence: string,
  transactions: FinancialTransactionRow[],
  useFrozenResults: boolean,
  includeInactive = false
): Promise<FinancialIndicatorView[]> {
  type IndicatorDatabaseRow = {
    id: string; name: string; description: string | null; unit: FinancialIndicatorUnit;
    sort_order: number; active: boolean; version_id: string; version: number;
    effective_from: string; formula: FinancialIndicatorFormula;
    result_value: string | null; result_components: FinancialIndicatorComponentResult[] | null;
    result_frozen_at: string | null; result_version_id: string | null;
    result_version: number | null; result_effective_from: string | null;
    result_formula: FinancialIndicatorFormula | null;
  };
  const rows = await client.query<IndicatorDatabaseRow>(
    `select i.id, i.name, i.description, i.unit, i.sort_order, i.active,
      v.id version_id, v.version, v.effective_from::text, v.formula,
      r.value::text result_value, r.component_results result_components, r.frozen_at::text result_frozen_at,
      rv.id result_version_id, rv.version result_version, rv.effective_from::text result_effective_from,
      rv.formula result_formula
     from financial_indicators i
     join lateral (
       select * from financial_indicator_versions candidate
       where candidate.tenant_id=i.tenant_id and candidate.indicator_id=i.id
         and candidate.effective_from <= $2::date
       order by candidate.effective_from desc, candidate.version desc limit 1
     ) v on true
     left join financial_indicator_results r on r.tenant_id=i.tenant_id and r.indicator_id=i.id and r.competence=$2
     left join financial_indicator_versions rv on rv.id=r.version_id and rv.tenant_id=r.tenant_id
     where i.tenant_id=$1
     order by i.sort_order, i.name`,
    [tenantId, `${competence}-01`]
  );
  const normalized = transactions.map(toIndicatorTransaction);
  const resolve = createFinancialIndicatorResolver(rows.rows.map((row) => {
    const frozen = useFrozenResults && row.result_value !== null && row.result_version_id !== null;
    return {
      id: row.id, name: row.name, unit: row.unit,
      formula: frozen && row.result_formula ? row.result_formula : row.formula,
      versionId: frozen ? row.result_version_id! : row.version_id,
      frozen: frozen ? { value: Number(row.result_value), components: row.result_components ?? [] } : undefined
    };
  }), normalized);
  return rows.rows.filter((row) => includeInactive || row.active || row.result_value !== null).map((row) => {
    const frozen = useFrozenResults && row.result_value !== null && row.result_version_id !== null;
    const formula = frozen && row.result_formula ? row.result_formula : row.formula;
    const calculated = resolve(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      unit: row.unit,
      sort_order: row.sort_order,
      active: row.active,
      version_id: frozen ? row.result_version_id! : row.version_id,
      version: frozen ? row.result_version! : row.version,
      effective_from: frozen ? row.result_effective_from! : row.effective_from,
      formula,
      value: frozen ? Number(row.result_value) : calculated.value,
      component_results: frozen && Array.isArray(row.result_components) ? row.result_components : calculated.components,
      frozen_at: frozen ? row.result_frozen_at : null,
      is_frozen: frozen
    };
  });
}

async function freezeFinancialIndicators(client: pg.PoolClient, tenantId: string, competence: string) {
  const transactions = await listTransactionsWithClient(client, tenantId, competence);
  const indicators = await listFinancialIndicatorsWithClient(client, tenantId, competence, transactions, false);
  for (const indicator of indicators) {
    await client.query(
      `insert into financial_indicator_results (
         tenant_id, indicator_id, version_id, competence, value, component_results, calculated_at, frozen_at
       ) values ($1,$2,$3,$4,$5,$6,now(),now())
       on conflict (tenant_id, indicator_id, competence) do update set
         version_id=excluded.version_id, value=excluded.value, component_results=excluded.component_results,
         calculated_at=now(), frozen_at=now()`,
      [tenantId, indicator.id, indicator.version_id, `${competence}-01`, indicator.value,
        JSON.stringify(indicator.component_results)]
    );
  }
}

async function validateIndicatorReferences(
  client: pg.PoolClient,
  tenantId: string,
  unit: FinancialIndicatorUnit,
  formula: FinancialIndicatorFormula
) {
  if (!formula.components.length && !formula.sourceIndicatorId) throw new FinancialIndicatorError("Inclua ao menos um componente no indicador.");
  if (formula.sourceIndicatorId) {
    const source = await client.query<{ unit: FinancialIndicatorUnit }>(
      "select unit from financial_indicators where tenant_id=$1 and id=$2", [tenantId, formula.sourceIndicatorId]
    );
    if (!source.rows[0]) throw new FinancialIndicatorError("O indicador-base não pertence a este tenant ou não está disponível.");
    if (source.rows[0].unit !== unit) throw new FinancialIndicatorError("O indicador e sua base precisam usar o mesmo formato de valor.");
  }
  if (unit === "currency" && formula.components.some((component) => component.aggregation === "count")) {
    throw new Error("Indicadores monetários aceitam soma ou média; use a unidade numérica para contagens.");
  }
  if (unit === "number" && formula.components.some((component) => component.aggregation !== "count")) {
    throw new Error("Indicadores numéricos usam componentes de contagem.");
  }
  const accountIds = unique(formula.components.flatMap((component) => component.filters.accountIds ?? []));
  const categoryIds = unique(formula.components.flatMap((component) => [
    ...(component.filters.categoryIds ?? []), ...(component.filters.subcategoryIds ?? [])
  ]));
  const natureKeys = unique(formula.components.flatMap((component) => component.filters.natureKeys ?? []));
  if (accountIds.length) {
    const found = await client.query<{ count: string }>(
      `select count(*)::text count from financial_accounts where tenant_id=$1 and id=any($2::uuid[])`,
      [tenantId, accountIds]
    );
    if (Number(found.rows[0].count) !== accountIds.length) throw new Error("Uma das contas selecionadas não pertence a este tenant.");
  }
  if (categoryIds.length) {
    const found = await client.query<{ count: string }>(
      `select count(*)::text count from financial_categories where tenant_id=$1 and id=any($2::uuid[])`,
      [tenantId, categoryIds]
    );
    if (Number(found.rows[0].count) !== categoryIds.length) throw new Error("Uma das categorias selecionadas não pertence a este tenant.");
  }
  if (natureKeys.length) {
    const found = await client.query<{ count: string }>(
      `select count(*)::text count from financial_natures where tenant_id=$1 and key=any($2::text[])`,
      [tenantId, natureKeys]
    );
    if (Number(found.rows[0].count) !== natureKeys.length) throw new Error("Uma das naturezas selecionadas não pertence a este tenant.");
  }
}

async function validateIndicatorDependencies(client: pg.PoolClient, tenantId: string, input: FinancialIndicatorInput, indicatorId = "new") {
  const versions = await client.query<{
    id: string; name: string; unit: FinancialIndicatorUnit; version: number;
    effective_from: string; formula: FinancialIndicatorFormula;
  }>(`select i.id, i.name, i.unit, v.version, v.effective_from::text, v.formula
      from financial_indicators i join financial_indicator_versions v on v.indicator_id=i.id and v.tenant_id=i.tenant_id
      where i.tenant_id=$1`, [tenantId]);
  const candidates = versions.rows.map((row) => row.id === indicatorId ? { ...row, unit: input.unit } : row);
  candidates.push({ id: indicatorId, name: input.name, unit: input.unit, version: Number.MAX_SAFE_INTEGER,
    effective_from: `${input.effectiveFrom}-01`, formula: input.formula });
  validateFinancialIndicatorVersions(candidates);
}

function toIndicatorTransaction(row: FinancialTransactionRow) {
  return {
    id: row.id,
    amountCents: Number(row.amount_cents),
    direction: row.direction,
    nature: row.nature,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    accountId: row.account_id,
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    internalTransferConfirmed: row.transfer_status === "confirmed"
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

async function loadRules(client: pg.PoolClient, tenantId: string, accountId?: string): Promise<ClassificationRule[]> {
  const result = await client.query<ClassificationRule & { source_type: string | null; financial_account_id: string | null }>(
    `select r.id, r.priority, r.source_type, r.financial_account_id, r.conditions, r.actions ||
      case when c.id is null then '{}'::jsonb else jsonb_build_object('categoryId', c.id) end as actions
     from financial_classification_rules r
     left join financial_categories c on c.tenant_id = r.tenant_id and c.name = r.actions->>'categoryName'
     where r.tenant_id = $1 and r.enabled and r.auto_apply
       and ($2::uuid is null or r.financial_account_id is null or r.financial_account_id=$2)
     order by r.priority, r.created_at`, [tenantId, accountId ?? null]
  );
  return result.rows.map((row) => ({ ...row, sourceType: row.source_type, financialAccountId: row.financial_account_id }));
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

async function listRulesWithClient(client: pg.PoolClient, tenantId: string) {
  const result = await client.query<FinancialRuleRow>(`select r.id, r.name, r.priority, r.source_type,
    r.financial_account_id, a.name account_name, r.conditions, r.actions ||
      case when c.id is null then '{}'::jsonb else jsonb_build_object('categoryId',c.id,'categoryName',c.name) end actions,
    r.enabled, r.auto_apply, r.updated_at::text
    from financial_classification_rules r
    left join financial_accounts a on a.id=r.financial_account_id and a.tenant_id=r.tenant_id
    left join financial_categories c on c.tenant_id=r.tenant_id and (
      c.id=nullif(r.actions->>'categoryId','')::uuid or
      ((r.actions->>'categoryId') is null and c.name=r.actions->>'categoryName')
    )
    where r.tenant_id=$1 order by r.enabled desc, r.priority, r.name`, [tenantId]);
  return result.rows;
}

async function validateRuleReferences(client: pg.PoolClient, tenantId: string, input: FinancialRuleInput) {
  const nature = await client.query(`select id from financial_natures where tenant_id=$1 and key=$2 and active`, [tenantId, input.actions.nature]);
  if (!nature.rows[0]) throw new Error("Selecione uma natureza financeira ativa.");
  if (input.actions.categoryId) {
    const category = await client.query(`select id from financial_categories where tenant_id=$1 and id=$2 and active`, [tenantId, input.actions.categoryId]);
    if (!category.rows[0]) throw new Error("Selecione uma categoria financeira ativa.");
  }
  if (input.financialAccountId) {
    const account = await client.query(`select id from financial_accounts where tenant_id=$1 and id=$2 and active`, [tenantId, input.financialAccountId]);
    if (!account.rows[0]) throw new Error("Selecione uma conta financeira ativa.");
  }
}

function toClassificationRule(id: string, input: FinancialRuleInput): ClassificationRule {
  return { id, priority: input.priority, sourceType: input.sourceType, financialAccountId: input.financialAccountId,
    conditions: input.conditions, actions: input.actions };
}

function toNormalizedTransaction(row: FinancialTransactionRow) {
  return {
    sourceLineNumber: 0, transactionDate: row.transaction_date, competence: row.competence.slice(0, 7),
    originalDescription: row.original_description, normalizedDescription: row.normalized_description,
    counterparty: row.counterparty ?? undefined, amountCents: Number(row.amount_cents), currency: "BRL",
    direction: row.direction, sourceType: row.source_type as ParsedStatement["sourceType"], nature: row.nature,
    includeExternalCashFlow: row.include_external_cash_flow, includeOperatingResult: row.include_operating_result,
    reviewRequired: row.review_required, rawData: {}
  };
}

async function audit(client: pg.PoolClient, tenantId: string, userId: string, action: string, entityType: string,
  entityId: string | null, before: unknown, after: unknown) {
  await client.query(`insert into financial_audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, userId, action, entityType, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
  );
}
