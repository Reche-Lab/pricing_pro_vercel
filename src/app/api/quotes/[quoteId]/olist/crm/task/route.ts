import { NextResponse } from "next/server";
import { z } from "zod";
import { markQuoteOlistCrmTask } from "@/repositories/quotes";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const taskSchema = z.object({
  description: z.string().trim().min(3),
  dueAt: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  dueTime: z.string().trim().optional().nullable(),
  responsibleExternalId: z.string().trim().optional().nullable()
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

  const scheduledAt = formatOlistDateTime(parsed.data.dueAt, parsed.data.dueDate, parsed.data.dueTime);
  const responsibleId = numericId(parsed.data.responsibleExternalId);
  const payload = compactObject({
    descricao: parsed.data.description,
    tipoData: scheduledAt ? "D" : "Q",
    data: scheduledAt,
    idUsuarioResponsavel: responsibleId,
    dataCriacao: today()
  });

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
    await markQuoteOlistCrmTask(loaded.session.userId, loaded.session.tenantId, quoteId, {
      taskId: result.externalId,
      response: result.result
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist CRM error"), { status: 502 });
  }
}

function formatOlistDateTime(dueAt: string | null | undefined, dueDate: string | null | undefined, dueTime: string | null | undefined) {
  const raw = dueAt?.trim();
  if (raw) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 09:00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.replace("T", " ").slice(0, 19).padEnd(19, ":00");
  }

  const date = dueDate?.trim();
  if (!date) return null;
  const time = dueTime?.trim() || "09:00";
  return `${date} ${time.length === 5 ? `${time}:00` : time}`;
}

function numericId(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "")
  ) as T;
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
