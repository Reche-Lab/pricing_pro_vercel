import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getTenantMember, userHasPermission } from "@/repositories/users";
import { extractExternalId, olistRequest } from "@/services/olist/olist";
import { buildOlistTaskPayload } from "@/services/olist/payloads";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const taskSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional().nullable(),
  dueAt: z.string().trim().optional().nullable(),
  subjectId: z.string().trim().optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { membershipId } = await context.params;
  const id = z.string().uuid().safeParse(membershipId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid membership id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const [allowed, member, connection] = await Promise.all([
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    getTenantMember(session.userId, session.tenantId, membershipId),
    getIntegrationConnection(session.userId, session.tenantId, "olist")
  ]);
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  if (!member) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Olist integration is not active." }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const path = replacePathTokens(settings.task_path ?? "", { idAssunto: parsed.data.subjectId });
  if (!path) return NextResponse.json({ ok: false, error: "Olist task path is not configured." }, { status: 409 });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });

  const payload = buildOlistTaskPayload({
    member,
    title: parsed.data.title,
    description: parsed.data.description,
    dueAt: parsed.data.dueAt
  });

  try {
    const result = await olistRequest({
      settings,
      credentials: decryptIntegrationCredentials<OlistCredentials>(connection),
      path: path.value,
      body: payload
    });
    const externalId = extractExternalId(result);
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist",
      operation: "tasks.create",
      status: "success",
      externalId,
      metadata: { membershipId, subjectId: parsed.data.subjectId, payload, result }
    });
    return NextResponse.json({ ok: true, externalId, result });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist",
      operation: "tasks.create",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Olist CRM error",
      metadata: { membershipId, subjectId: parsed.data.subjectId, payload }
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist CRM error" },
      { status: 502 }
    );
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
