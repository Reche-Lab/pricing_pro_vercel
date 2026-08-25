import { normalizeText } from "@/domain/finance/csv";

export type TransferCandidateTransaction = {
  id: string;
  accountId: string;
  transactionDate: string;
  amountCents: number;
  currency: string;
  description: string;
  counterparty?: string | null;
  sameEconomicEntity: boolean;
  ownershipType: string;
};

export type TransferSuggestion = {
  outgoingTransactionId: string;
  incomingTransactionId: string;
  score: number;
  reasons: string[];
  requiresConfirmation: boolean;
};

export function suggestInternalTransfers(transactions: TransferCandidateTransaction[], toleranceDays = 2): TransferSuggestion[] {
  const outgoing = transactions.filter((item) => item.amountCents < 0);
  const incoming = transactions.filter((item) => item.amountCents > 0);
  const usedIncoming = new Set<string>();
  const suggestions: TransferSuggestion[] = [];

  for (const debit of outgoing) {
    const candidates = incoming
      .filter((credit) => !usedIncoming.has(credit.id) && credit.accountId !== debit.accountId)
      .map((credit) => scorePair(debit, credit, toleranceDays))
      .filter((candidate): candidate is TransferSuggestion => candidate !== null)
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (best && best.score >= 0.72) {
      suggestions.push(best);
      usedIncoming.add(best.incomingTransactionId);
    }
  }
  return suggestions;
}

function scorePair(debit: TransferCandidateTransaction, credit: TransferCandidateTransaction, toleranceDays: number): TransferSuggestion | null {
  if (Math.abs(debit.amountCents) !== credit.amountCents || debit.currency !== credit.currency) return null;
  const days = dateDifference(debit.transactionDate, credit.transactionDate);
  if (days > toleranceDays) return null;
  const reasons = ["Mesmo valor absoluto", days === 0 ? "Mesma data" : `Datas com ${days} dia(s) de diferença`];
  let score = 0.55 + (days === 0 ? 0.25 : days === 1 ? 0.15 : 0.08);
  const combined = normalizeText(`${debit.description} ${credit.description} ${debit.counterparty ?? ""} ${credit.counterparty ?? ""}`);
  if (/TRANSFERENCIA|PIX/.test(combined)) { score += 0.12; reasons.push("Descrição compatível com transferência"); }
  const personal = [debit, credit].some((item) => ["personal", "owner", "partner"].includes(item.ownershipType));
  const sameEntity = debit.sameEconomicEntity && credit.sameEconomicEntity;
  if (sameEntity) { score += 0.08; reasons.push("Contas da mesma entidade econômica"); }
  if (personal) { score -= 0.2; reasons.push("Conta pessoal ou de titular exige confirmação"); }
  return {
    outgoingTransactionId: debit.id, incomingTransactionId: credit.id,
    score: Math.max(0, Math.min(1, Number(score.toFixed(4)))), reasons,
    requiresConfirmation: personal || !sameEntity || score < 0.95
  };
}

function dateDifference(left: string, right: string) {
  return Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / 86_400_000;
}
