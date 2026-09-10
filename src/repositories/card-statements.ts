import { withTenantContext } from "@/lib/db/client";
import { CardStatementError, paymentMatch } from "@/domain/finance/card-statements";

export async function listCardStatements(userId: string, tenantId: string, competence: string) {
  return withTenantContext(userId, tenantId, async client => {
    const statements = await client.query<{ id: string; due_date: string; total_cents: string; currency: string; account_name: string }>(
      `select s.id,s.due_date::text,s.total_cents::text,a.currency,a.name account_name
       from credit_card_statements s join financial_accounts a on a.id=s.financial_account_id and a.tenant_id=s.tenant_id
       where s.tenant_id=$1 and s.due_date >= $2::date and s.due_date < $2::date + interval '1 month' order by s.due_date,a.name`, [tenantId, `${competence}-01`]);
    const movements = await client.query<{ id: string; transaction_date: string; amount_cents: string; currency: string; original_description: string; account_name: string; statement_id: string | null }>(
      `select t.id,t.transaction_date::text,t.amount_cents::text,t.currency,t.original_description,a.name account_name,p.statement_id
       from financial_transactions t join financial_accounts a on a.id=t.financial_account_id and a.tenant_id=t.tenant_id
       left join credit_card_payments p on p.transaction_id=t.id and p.tenant_id=t.tenant_id
       where t.tenant_id=$1 and a.account_type<>'credit_card' and t.amount_cents<0
         and t.direction='outflow' and t.internal_transfer_pair_id is null
         and ((t.transaction_date between $2::date - interval '45 days' and $2::date + interval '75 days')
           or p.statement_id=any($3::uuid[])) order by t.transaction_date desc`, [tenantId, `${competence}-01`, statements.rows.map(s => s.id)]);
    return statements.rows.map(statement => {
      const payments = movements.rows.filter(row => row.statement_id === statement.id);
      const paidCents = payments.reduce((sum, row) => sum + Math.abs(Number(row.amount_cents)), 0);
      return { ...statement, payments, paidCents, remainingCents: Number(statement.total_cents) - paidCents,
        candidates: movements.rows.filter(row => !row.statement_id && row.currency === statement.currency).map(row => ({ ...row,
          ...paymentMatch(Number(statement.total_cents) - paidCents, Number(row.amount_cents), statement.due_date, row.transaction_date)
        })).sort((a, b) => Number(b.suggested) - Number(a.suggested)) };
    });
  });
}

export async function setCardPayment(userId: string, tenantId: string, statementId: string, transactionId: string, action: "link" | "unlink") {
  return withTenantContext(userId, tenantId, async client => {
    const statements = await client.query(`select s.*,i.currency,i.competence from credit_card_statements s
      join bank_statement_imports i on i.id=s.import_id and i.tenant_id=s.tenant_id
      where s.tenant_id=$1 and s.id=$2 for update of s`, [tenantId, statementId]);
    const statement = statements.rows[0];
    if (!statement) throw new CardStatementError("Fatura não encontrada neste tenant.");
    const transactions = await client.query(`select t.*,a.account_type from financial_transactions t
      join financial_accounts a on a.id=t.financial_account_id and a.tenant_id=t.tenant_id
      where t.tenant_id=$1 and t.id=$2 for update of t`, [tenantId, transactionId]);
    const transaction = transactions.rows[0];
    if (!transaction || transaction.account_type === "credit_card" || transaction.direction !== "outflow"
      || Number(transaction.amount_cents) >= 0 || transaction.currency !== statement.currency || transaction.internal_transfer_pair_id) {
      throw new CardStatementError("Selecione uma saída bancária na mesma moeda, sem vínculo de transferência.");
    }
    if ((await client.query("select id from financial_months where tenant_id=$1 and competence=any($2::date[]) and status='completed'", [tenantId, [statement.competence, transaction.competence]])).rowCount) throw new CardStatementError("Reabra as competências envolvidas antes de alterar o vínculo.");
    const existing = await client.query("select * from credit_card_payments where tenant_id=$1 and transaction_id=$2", [tenantId, transactionId]);
    if (action === "link") {
      if (existing.rows[0]?.statement_id === statementId) return { ok: true };
      if (existing.rowCount) throw new CardStatementError("Este pagamento já está vinculado a outra fatura.");
      await client.query(`insert into credit_card_payments(tenant_id,statement_id,transaction_id,previous_flags,confirmed_by)
        values($1,$2,$3,$4,$5)`, [tenantId, statementId, transactionId, JSON.stringify({ entry_kind: transaction.entry_kind, include_external_cash_flow: transaction.include_external_cash_flow, include_operating_result: transaction.include_operating_result }), userId]);
      await client.query("update financial_transactions set entry_kind='bill_payment',include_external_cash_flow=true,include_operating_result=false,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, transactionId]);
    } else {
      const link = existing.rows[0];
      if (!link || link.statement_id !== statementId) throw new CardStatementError("Vínculo de pagamento não encontrado.");
      await client.query("delete from credit_card_payments where tenant_id=$1 and id=$2", [tenantId, link.id]);
      await client.query("update financial_transactions set entry_kind=$3,include_external_cash_flow=$4,include_operating_result=$5,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, transactionId, link.previous_flags.entry_kind, link.previous_flags.include_external_cash_flow, link.previous_flags.include_operating_result]);
    }
    await client.query(`insert into financial_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
      values($1,$2,$3,'credit_card_statement',$4,$5)`, [tenantId, userId, `card_payment.${action}`, statementId, JSON.stringify({ transactionId, amountCents: Number(transaction.amount_cents) })]);
    return { ok: true };
  });
}
