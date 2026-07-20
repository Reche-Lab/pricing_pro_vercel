import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCustomerFromOlistProfile } from "@/repositories/customers";
import { loadQuoteOlistContext, sendOlistQuoteOperation } from "../../_shared";

const useCustomerSchema = z.object({
  externalId: z.string().trim().min(1),
  raw: z.unknown().optional()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = useCustomerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const customerId = loaded.detail.quote.customer_id;
  if (!customerId) return NextResponse.json({ ok: false, error: "Quote has no customer." }, { status: 409 });

  const olistProfile = extractOlistCustomerProfile(parsed.data.raw, parsed.data.externalId)
    ?? await fetchOlistCustomerProfile({
      externalId: parsed.data.externalId,
      loaded,
      quoteId
    });

  await updateCustomerFromOlistProfile(loaded.session.userId, loaded.session.tenantId, customerId, {
    externalOlistId: parsed.data.externalId,
    ...olistProfile
  });

  return NextResponse.json({
    ok: true,
    externalId: parsed.data.externalId,
    profileSynced: Boolean(olistProfile),
    message: olistProfile
      ? `Cliente Olist vinculado e dados persistidos localmente. ID: ${parsed.data.externalId}.`
      : `Cliente Olist vinculado ao orçamento. ID: ${parsed.data.externalId}.`
  });
}

async function fetchOlistCustomerProfile(input: {
  externalId: string;
  loaded: Exclude<Awaited<ReturnType<typeof loadQuoteOlistContext>>, { error: unknown }>;
  quoteId: string;
}) {
  const basePath = input.loaded.settings.customer_path || "/contatos";
  const path = `${basePath.replace(/\/+$/, "")}/${encodeURIComponent(input.externalId)}`;
  try {
    const result = await sendOlistQuoteOperation({
      userId: input.loaded.session.userId,
      tenantId: input.loaded.session.tenantId,
      provider: "olist",
      operation: "customers.lookup",
      quoteId: input.quoteId,
      settings: input.loaded.settings,
      credentials: input.loaded.credentials,
      path,
      method: "GET",
      payload: { id: input.externalId }
    });
    return extractOlistCustomerProfile(result.result, input.externalId);
  } catch (error) {
    console.warn("Olist customer profile fetch failed during local sync.", {
      quoteId: input.quoteId,
      externalId: input.externalId,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return null;
  }
}

function extractOlistCustomerProfile(data: unknown, externalId: string) {
  const record = firstRecord(data);
  if (!record) return null;
  const source = record as Record<string, unknown>;
  const endereco = nestedRecord(source, ["endereco", "enderecoPrincipal", "enderecoEntrega"]);
  const profile = {
    name: pickString(source, ["nome", "name", "razaoSocial", "fantasia"]),
    document: pickString(source, ["cpfCnpj", "documento", "document"]),
    email: pickString(source, ["email"]),
    phone: pickString(source, ["celular", "telefone", "phone"]),
    postalCode: pickString(endereco, ["cep", "postalCode"]) ?? pickString(source, ["cep", "postalCode"]),
    addressLine: pickString(endereco, ["endereco", "logradouro", "addressLine"])
      ?? pickString(source, ["endereco", "logradouro", "addressLine"]),
    addressNumber: pickString(endereco, ["numero", "enderecoNro", "number"])
      ?? pickString(source, ["numero", "enderecoNro", "number"]),
    addressComplement: pickString(endereco, ["complemento", "complement"])
      ?? pickString(source, ["complemento", "complement"]),
    district: pickString(endereco, ["bairro", "district"]) ?? pickString(source, ["bairro", "district"]),
    city: pickString(endereco, ["municipio", "cidade", "city"])
      ?? pickString(source, ["municipio", "cidade", "city"]),
    state: pickString(endereco, ["uf", "estado", "state"]) ?? pickString(source, ["uf", "estado", "state"])
  };
  const normalized = Object.fromEntries(Object.entries(profile).filter(([, value]) => value)) as typeof profile;
  void externalId;
  return Object.keys(normalized).length ? normalized : null;
}

function firstRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return firstRecord(data[0]);
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.itens)) return firstRecord(record.itens);
  if (Array.isArray(record.items)) return firstRecord(record.items);
  if (record.data) return firstRecord(record.data);
  if (record.retorno) return firstRecord(record.retorno);
  if (record.contato) return firstRecord(record.contato);
  return record;
}

function nestedRecord(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
