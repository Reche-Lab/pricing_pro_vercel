// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/client";
import { detectAndParseStatement } from "@/domain/finance/adapters";
import { sha256 } from "@/domain/finance/csv";
import { classifyFinancialTransactions, getFinancialComparison, getFinancialOverview, importFinancialStatement, upsertFinancialAccount } from "@/repositories/finance";
import { listCardStatements, setCardPayment } from "@/repositories/card-statements";

const url = process.env.FINANCE_TEST_DATABASE_URL;
describe.skipIf(!url)("credit card finance isolated database", () => {
  let tenant: string, user: string, bank: string, card: string, statement: string, payment: string;
  const cardCsv = 'date,title,amount\n2026-04-25,Supermercado,"10,00"\n2026-04-25,Supermercado,"10,00"\n2026-04-28,Pagamento recebido,"- 5,00"';
  async function importCsv(text: string, accountId: string, filename: string) {
    const bytes = new TextEncoder().encode(text);
    const parsed = await detectAndParseStatement({ filename, contentType: "text/csv", bytes, text, competence: "2026-05", dueDate: "2026-05-28" });
    if (parsed.status !== "parsed") throw new Error("not parsed");
    return importFinancialStatement({ userId: user, tenantId: tenant, accountId, competence: "2026-05", filename, contentType: "text/csv", bytes, checksum: sha256(bytes), parsed: parsed.statement, detectionConfidence: 1 });
  }
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated database required");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false";
    tenant = (await getPool().query("insert into tenants(name,slug) values('Finanças pessoais teste',$1) returning id", [`finance-${randomUUID()}`])).rows[0].id;
    user = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Teste','not-a-password','active') returning id", [`finance-${randomUUID()}@example.test`])).rows[0].id;
    await getPool().query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenant, user]);
    const defaults = { institution: "nubank", currency: "BRL", ownershipType: "personal", sameEconomicEntity: true, requiredForMonthlyClose: true };
    bank = (await upsertFinancialAccount(user, tenant, { ...defaults, name: "Conta pessoal", accountType: "checking" })).id;
    card = (await upsertFinancialAccount(user, tenant, { ...defaults, name: "Cartão pessoal", accountType: "credit_card" })).id;
  });
  afterAll(async () => {
    const db = getPool();
    if (tenant) {
      await db.query("delete from credit_card_payments where tenant_id=$1", [tenant]);
      await db.query("delete from financial_transactions where tenant_id=$1", [tenant]);
      await db.query("delete from tenants where id=$1", [tenant]);
    }
    if (user) await db.query("delete from app_users where id=$1", [user]);
    await db.end(); globalThis.__pricingPool = undefined;
  });
  it("imports card rows separately and preserves repeated purchases", async () => {
    await expect(importCsv(cardCsv, bank, "card.csv")).rejects.toThrow(/Cartão/);
    const imported = await importCsv(cardCsv, card, "card.csv");
    expect(imported.duplicate).toBe(false);
    expect((await importCsv(cardCsv, card, "renamed.csv")).duplicate).toBe(true);
    await expect(importCsv(`${cardCsv}\n2026-05-01,Outra compra,"1,00"`, card, "revision.csv")).rejects.toThrow(/já possui/);
    const rows = (await getPool().query("select * from financial_transactions where tenant_id=$1 order by transaction_date", [tenant])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.filter(row => row.entry_kind === "card_purchase")).toHaveLength(2);
    expect(rows.every(row => !row.include_external_cash_flow)).toBe(true);
    expect((await listCardStatements(user, tenant, "2026-05"))[0].total_cents).toBe("2000");
  });
  it("suggests a one-cent difference, links explicitly and never duplicates expense", async () => {
    await importCsv('Data,Valor,Identificador,Descrição\n27/05/2026,-20.01,payment-test,Pagamento de fatura', bank, "bank.csv");
    let statements = await listCardStatements(user, tenant, "2026-05");
    statement = statements[0].id; payment = statements[0].candidates[0].id;
    expect(statements[0].payments).toHaveLength(0);
    expect(statements[0].candidates[0]).toMatchObject({ suggested: true, differenceCents: 1 });
    await setCardPayment(user, tenant, statement, payment, "link");
    await setCardPayment(user, tenant, statement, payment, "link");
    statements = await listCardStatements(user, tenant, "2026-05");
    expect(statements[0]).toMatchObject({ paidCents: 2001, remainingCents: -1 });
    expect(statements[0].payments).toHaveLength(1);
    const overview = await getFinancialOverview(user, tenant, "2026-05");
    expect(overview.metrics).toMatchObject({ externalOutflowsCents: 2001, operationalOutflowsCents: 2000 });
    expect(overview.transfers).toHaveLength(0);
  });
  it("compares monthly categories and natures with zero periods and tenant isolation", async () => {
    const category = (await getPool().query("select id from financial_categories where tenant_id=$1 and name='Despesas operacionais'", [tenant])).rows[0].id;
    await getPool().query("update financial_transactions set category_id=$2 where tenant_id=$1 and entry_kind='card_purchase'", [tenant, category]);
    const comparison = await getFinancialComparison(user, tenant, "2026-05", 3);
    expect(comparison.series.map(item => item.balanceCents)).toEqual([0, 0, -4001]);
    expect(comparison.groups.categories.find(item => item.id === category)?.series.map(item => item.balanceCents)).toEqual([0, 0, -2000]);
    expect(comparison.groups.categories.find(item => item.id === "uncategorized")?.series[2].balanceCents).toBe(-2001);
    expect(comparison.groups.natures.find(item => item.id === "informative")?.series[2].balanceCents).toBe(0);
    expect(comparison.groups.natures.find(item => item.id === "debt")?.series[2]).toMatchObject({ operatingResultCents: 0, externalOutflowsCents: 2001 });
    const other = await getFinancialComparison(user, randomUUID(), "2026-05", 3);
    expect(other.groups).toEqual({ categories: [], natures: [] });
    expect(other.series.every(item => item.balanceCents === 0)).toBe(true);
  });
  it("scopes quick classification rules to the card account, preserving bank cash flow", async () => {
    const purchases = (await getPool().query("select id from financial_transactions where tenant_id=$1 and entry_kind='card_purchase'", [tenant])).rows.map(row => row.id);
    const result = await classifyFinancialTransactions(user, tenant, { transactionIds: purchases, nature: "operating_expense", includeExternalCashFlow: false, includeOperatingResult: true, createRule: { name: "Supermercado", descriptionContains: "Supermercado" } });
    expect((await getPool().query("select financial_account_id from financial_classification_rules where id=$1", [result.ruleId])).rows[0].financial_account_id).toBe(card);
    await importCsv('Data,Valor,Identificador,Descrição\n27/05/2026,-10.00,shop-test,Supermercado', bank, "another-bank.csv");
    const movement = (await getPool().query("select * from financial_transactions where tenant_id=$1 and source_identifier='shop-test'", [tenant])).rows[0];
    expect(movement.include_external_cash_flow).toBe(true);
    expect(movement.classification_rule_id).toBeNull();
    await expect(classifyFinancialTransactions(user, tenant, { transactionIds: [movement.id], nature: "operating_expense", includeExternalCashFlow: true, includeOperatingResult: true, createRule: { name: "Supermercado", descriptionContains: "Supermercado" } })).rejects.toThrow(/outro escopo/);
  });
  it("protects flags against later manual/rule updates and scopes links by tenant", async () => {
    await getPool().query("update financial_transactions set include_external_cash_flow=true,include_operating_result=true where tenant_id=$1", [tenant]);
    const rows = (await getPool().query("select * from financial_transactions where tenant_id=$1", [tenant])).rows;
    expect(rows.filter(row => row.entry_kind.startsWith("card_")).every(row => !row.include_external_cash_flow)).toBe(true);
    expect(rows.filter(row => ["bill_payment", "card_payment"].includes(row.entry_kind)).every(row => !row.include_operating_result)).toBe(true);
    expect(await listCardStatements(user, randomUUID(), "2026-05")).toEqual([]);
    await expect(setCardPayment(user, randomUUID(), statement, payment, "link")).rejects.toThrow(/não encontrada/);
    await setCardPayment(user, tenant, statement, payment, "unlink");
    expect((await listCardStatements(user, tenant, "2026-05"))[0].paidCents).toBe(0);
    await getPool().query("update financial_months set status='completed' where tenant_id=$1", [tenant]);
    await expect(setCardPayment(user, tenant, statement, payment, "link")).rejects.toThrow(/Reabra/);
  });
});
