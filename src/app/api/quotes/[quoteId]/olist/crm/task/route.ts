import { NextResponse } from "next/server";
import { z } from "zod";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const taskSchema = z.object({
  description: z.string().trim().min(3),
  dueAt: z.string().trim().optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist_crm");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => null);
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const subjectId = loaded.detail.quote.external_crm_id;
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "Crie o assunto CRM deste orçamento antes de criar uma tarefa." }, { status: 409 });
  }

  const path = replacePathTokens(loaded.settings.task_path ?? "", { idAssunto: subjectId });
  if (!path) return NextResponse.json({ ok: false, error: "Olist CRM task path is not configured." }, { status: 409 });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });

  const payload = {
    descricao: parsed.data.description,
    tipoData: parsed.data.dueAt ? "D" : "Q",
    data: parsed.data.dueAt ?? null
  };

  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "crm.tasks.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: path.value,
      payload
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist CRM error"), { status: 502 });
  }
}

function replacePathTokens(template: string, values: Record<string, string | null | undefined>) {
  if (!template) return "";
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    if (!output.includes(`{${key}}`)) continue;
    if (!value) return { error: `Olist path requires ${key}.` } as const;
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return { value: output } as const;
}
