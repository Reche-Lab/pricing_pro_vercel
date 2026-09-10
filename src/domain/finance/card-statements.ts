import { normalizeText } from "@/domain/finance/csv";
import type { NormalizedFinancialTransaction, ParsedStatement } from "@/domain/finance/types";

export class CardStatementError extends Error {}

export function isCardPaymentDescription(description: string) {
  return /^(PAGAMENTO RECEBIDO|PAGAMENTO DE FATURA|PAGAMENTO DA FATURA)(\b|$)/.test(normalizeText(description));
}

export function asCardStatement(statement: ParsedStatement, competence: string, dueDate?: string): ParsedStatement {
  const transactions = statement.transactions.map(transaction => {
    const payment = isCardPaymentDescription(transaction.originalDescription);
    const amountCents = -transaction.amountCents;
    return {
      ...transaction, amountCents, netAmountCents: amountCents, competence: `${competence}-01`,
      entryKind: payment ? "card_payment" : amountCents > 0 ? "card_refund" : "card_purchase",
      direction: payment ? "neutral" : amountCents > 0 ? "inflow" : "outflow",
      nature: payment ? "informative" : amountCents > 0 ? "refund" : "unclassified",
      includeExternalCashFlow: false, includeOperatingResult: !payment, reviewRequired: !payment
    } satisfies NormalizedFinancialTransaction;
  });
  return { ...statement, statementKind: "card", dueDate,
    invoiceTotalCents: -transactions.filter(item => item.entryKind !== "card_payment").reduce((sum, item) => sum + item.amountCents, 0),
    transactions,
    warnings: [...statement.warnings, "Compras e estornos entram na competência da fatura. Pagamentos recebidos no CSV são informativos e não reduzem novamente as despesas."]
  };
}

export function paymentMatch(totalCents: number, amountCents: number, dueDate: string, paymentDate: string) {
  const differenceCents = Math.abs(amountCents) - totalCents;
  const days = Math.abs(Date.parse(paymentDate.slice(0, 10)) - Date.parse(dueDate.slice(0, 10))) / 86400000;
  return { suggested: totalCents > 0 && amountCents < 0 && Math.abs(differenceCents) <= 1 && days <= 10, differenceCents };
}
