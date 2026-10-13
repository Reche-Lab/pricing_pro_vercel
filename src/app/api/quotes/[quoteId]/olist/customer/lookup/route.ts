import { NextResponse } from "next/server";
import { z } from "zod";
import { buildOlistCustomerLookupPayload } from "@/services/olist/payloads";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { buildOlistCustomerLookupPath, resolveQuoteCustomerLookupCriteria } from "@/services/olist/customer-lookup";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const customerLookupSchema = z.object({
  mode: z.enum(["auto", "nome", "cpfCnpj", "celular", "email", "codigo"]).optional().default("auto"),
  value: z.string().trim().optional().nullable(),
  preferredField: z.enum(["nome", "cpfCnpj", "celular", "email", "codigo"]).optional(),
  cpfCnpj: z.string().trim().optional().nullable(),
  celular: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  codigo: z.string().trim().optional().nullable(),
  nome: z.string().trim().optional().nullable(),
  situacao: z.enum(["", "B", "A", "I", "E"]).optional().default("")
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = customerLookupSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const quotePayload = buildOlistCustomerLookupPayload(loaded.detail.quote);
  const criteria = resolveQuoteCustomerLookupCriteria(parsed.data, { ...quotePayload, codigo: "" });
  if (!criteria.value) {
    return NextResponse.json({ ok: false, error: "Preencha o campo escolhido com nome, CPF/CNPJ, telefone, e-mail ou código Olist para buscar." }, { status: 400 });
  }
  const path = loaded.settings.customer_lookup_path || loaded.settings.customer_path || OLIST_DEFAULT_PATHS.customerLookup;
  const lookupPath = buildOlistCustomerLookupPath(path, criteria, parsed.data.situacao);
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "customers.lookup",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: lookupPath,
      payload: { mode: criteria.mode, [criteria.mode]: criteria.value, situacao: parsed.data.situacao || null },
      method: "GET"
    });
    const response = {
      ...result,
      lookup: {
        criteria: { campo: criteria.mode, valor: criteria.value, situacao: parsed.data.situacao || "todas" },
        path: lookupPath
      }
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}
