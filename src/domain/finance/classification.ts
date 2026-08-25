import { normalizeText } from "@/domain/finance/csv";
import type { ClassificationRule, ClassifiedTransaction, NormalizedFinancialTransaction } from "@/domain/finance/types";

export function classifyTransaction(
  transaction: NormalizedFinancialTransaction,
  rules: ClassificationRule[]
): ClassifiedTransaction {
  if (transaction.nature === "informative") {
    return { ...transaction, classificationConfidence: 1, classificationSource: "adapter" };
  }
  const matched = [...rules]
    .filter((rule) => (!rule.sourceType || rule.sourceType === transaction.sourceType) && ruleMatchesTransaction(transaction, rule))
    .sort((left, right) => left.priority - right.priority)[0];
  if (!matched) {
    return { ...transaction, classificationConfidence: 0, classificationSource: "unclassified" };
  }
  return {
    ...transaction,
    nature: matched.actions.nature,
    categoryId: matched.actions.categoryId,
    includeExternalCashFlow: matched.actions.includeExternalCashFlow ?? transaction.includeExternalCashFlow,
    includeOperatingResult: matched.actions.includeOperatingResult ?? transaction.includeOperatingResult,
    reviewRequired: matched.actions.reviewRequired ?? false,
    classificationRuleId: matched.id,
    classificationConfidence: matched.actions.reviewRequired ? 0.7 : 1,
    classificationSource: "rule"
  };
}

export function classifyTransactions(transactions: NormalizedFinancialTransaction[], rules: ClassificationRule[]) {
  return transactions.map((transaction) => classifyTransaction(transaction, rules));
}

export function ruleMatchesTransaction(transaction: NormalizedFinancialTransaction, rule: ClassificationRule) {
  const conditions = rule.conditions;
  const description = normalizeText(transaction.normalizedDescription);
  if (conditions.descriptionContains && !description.includes(normalizeText(conditions.descriptionContains))) return false;
  if (conditions.descriptionStartsWith && !description.startsWith(normalizeText(conditions.descriptionStartsWith))) return false;
  if (conditions.regex) {
    try {
      if (!new RegExp(conditions.regex, "iu").test(transaction.originalDescription)) return false;
    } catch {
      return false;
    }
  }
  if (conditions.direction && transaction.direction !== conditions.direction) return false;
  const absoluteAmount = Math.abs(transaction.amountCents);
  if (conditions.minimumAmountCents !== undefined && absoluteAmount < conditions.minimumAmountCents) return false;
  if (conditions.maximumAmountCents !== undefined && absoluteAmount > conditions.maximumAmountCents) return false;
  if (conditions.exactAmountCents !== undefined && absoluteAmount !== conditions.exactAmountCents) return false;
  return true;
}
