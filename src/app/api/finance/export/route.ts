import { NextResponse } from "next/server";
import { buildFinancialCsv, buildFinancialWorkbook } from "@/services/finance/export";
import { getFinancialExportData } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:export");
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const competence = params.get("competence") || new Date().toISOString().slice(0, 7);
  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  try {
    const data = await getFinancialExportData(auth.session.userId, auth.session.tenantId, competence);
    if (format === "csv") {
      return new Response(`\uFEFF${buildFinancialCsv(data)}`, { headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=Relatorio_Financeiro_${competence}.csv`
      } });
    }
    const workbook = await buildFinancialWorkbook(data);
    return new Response(workbook, { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename=Relatorio_Financeiro_${competence}.xlsx`
    } });
  } catch (error) { return financeError(error, "report.export"); }
}
