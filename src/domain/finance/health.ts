export type FinancialHealthInput = {
  requiredAccounts: number;
  missingAccounts: number;
  failedImports: number;
  importsNeedingReview: number;
  balanceMismatches: number;
  pendingReviews: number;
  unclassifiedTransactions: number;
  suggestedTransfers: number;
};

export type FinancialPendency = {
  key: keyof Omit<FinancialHealthInput, "requiredAccounts">;
  count: number;
  severity: "blocking" | "attention";
  label: string;
  description: string;
  action: "imports" | "transactions" | "transfers";
};

const definitions: Array<Omit<FinancialPendency, "count">> = [
  { key: "missingAccounts", severity: "blocking", label: "Extratos obrigatórios", description: "Contas obrigatórias ainda sem extrato válido nesta competência.", action: "imports" },
  { key: "failedImports", severity: "blocking", label: "Importações com erro", description: "Arquivos que precisam ser corrigidos ou importados novamente.", action: "imports" },
  { key: "balanceMismatches", severity: "blocking", label: "Diferenças de saldo", description: "Extratos cujo saldo informado não confere com os lançamentos processados.", action: "imports" },
  { key: "pendingReviews", severity: "blocking", label: "Revisões pendentes", description: "Lançamentos marcados para conferência antes do fechamento.", action: "transactions" },
  { key: "unclassifiedTransactions", severity: "attention", label: "Sem classificação", description: "Lançamentos que ainda não explicam corretamente o resultado do negócio.", action: "transactions" },
  { key: "importsNeedingReview", severity: "attention", label: "Extratos para revisar", description: "Importações concluídas que contêm alertas ou itens pendentes.", action: "imports" },
  { key: "suggestedTransfers", severity: "attention", label: "Transferências sugeridas", description: "Pares detectados que aguardam confirmação ou rejeição.", action: "transfers" }
];

export function calculateFinancialHealth(input: FinancialHealthInput) {
  const pendencies = definitions
    .map((definition) => ({ ...definition, count: input[definition.key] }))
    .filter((item) => item.count > 0);
  const requiredChecks = Math.max(1, input.requiredAccounts + 4);
  const completedChecks = Math.max(0,
    input.requiredAccounts - input.missingAccounts
    + Number(input.failedImports === 0)
    + Number(input.balanceMismatches === 0)
    + Number(input.pendingReviews === 0)
    + Number(input.unclassifiedTransactions === 0)
  );
  return {
    score: Math.round(Math.min(1, completedChecks / requiredChecks) * 100),
    readyToClose: !pendencies.some((item) => item.severity === "blocking"),
    blockingCount: pendencies.filter((item) => item.severity === "blocking").reduce((sum, item) => sum + item.count, 0),
    attentionCount: pendencies.filter((item) => item.severity === "attention").reduce((sum, item) => sum + item.count, 0),
    pendencies
  };
}
