import { NextResponse } from "next/server";
import { z } from "zod";
import { detectAndParseStatement, readStatementText } from "@/domain/finance/adapters";
import { sha256 } from "@/domain/finance/csv";
import type { GenericColumnMapping, ParsedStatement } from "@/domain/finance/types";
import { requireWritableBilling } from "@/lib/billing/guard";
import { importFinancialStatement } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const metadataSchema = z.object({
  accountId: z.string().uuid(), competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  action: z.enum(["preview", "import"]).default("preview")
});

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:import");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const metadata = metadataSchema.safeParse({
      accountId: form.get("accountId"), competence: form.get("competence"), action: form.get("action") || "preview"
    });
    if (!(file instanceof File) || !metadata.success) {
      return NextResponse.json({ ok: false, error: "Arquivo, conta e competência são obrigatórios." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE || !file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ ok: false, error: "Envie um CSV válido de até 10 MB." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mapping = parseMapping(form.get("mapping"));
    const parsed = await detectAndParseStatement({
      filename: file.name, contentType: file.type || "text/csv", bytes, text: readStatementText(bytes),
      competence: metadata.data.competence, mapping
    });
    if (parsed.status === "needs_mapping") {
      return NextResponse.json({ ok: false, needsMapping: true, confidence: parsed.confidence, headers: parsed.headers,
        error: "Layout não reconhecido. Relacione as colunas antes de importar." }, { status: 422 });
    }
    const statement = parsed.statement;
    const preview = summarize(statement, metadata.data.competence);
    if (metadata.data.action === "preview") {
      return NextResponse.json({ ok: true, preview, confidence: parsed.confidence });
    }
    const result = await importFinancialStatement({
      userId: auth.session.userId, tenantId: auth.session.tenantId, accountId: metadata.data.accountId,
      competence: metadata.data.competence, filename: file.name, contentType: file.type || "text/csv",
      bytes, checksum: sha256(bytes), parsed: statement, detectionConfidence: parsed.confidence
    });
    console.info("Financial statement imported.", { tenantId: auth.session.tenantId, accountId: metadata.data.accountId,
      filename: file.name, checksum: sha256(bytes), sourceType: statement.sourceType, ...result });
    return NextResponse.json({ ok: true, result, preview });
  } catch (error) { return financeError(error, "statements.import"); }
}

function parseMapping(value: FormDataEntryValue | null): GenericColumnMapping | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = JSON.parse(value) as GenericColumnMapping;
  return parsed;
}

function summarize(statement: ParsedStatement, competence: string) {
  const transactions = statement.transactions;
  const mismatched = transactions.filter((item) => !item.transactionDate.startsWith(competence)).length;
  return {
    institution: statement.sourceType, adapterName: statement.adapterName,
    rows: statement.rawRows.length, transactions: transactions.length, ignoredRows: statement.ignoredRows,
    inflowsCents: transactions.filter((item) => item.amountCents > 0 && item.direction !== "neutral").reduce((sum, item) => sum + item.amountCents, 0),
    outflowsCents: Math.abs(transactions.filter((item) => item.amountCents < 0 && item.direction !== "neutral").reduce((sum, item) => sum + item.amountCents, 0)),
    initialBalanceCents: statement.initialBalanceCents ?? null, finalBalanceCents: statement.finalBalanceCents ?? null,
    informativeRows: transactions.filter((item) => item.direction === "neutral").length,
    mismatchedPeriodRows: mismatched, warnings: [...statement.warnings, ...(mismatched ? [`${mismatched} linha(s) fora da competência selecionada.`] : [])]
  };
}
