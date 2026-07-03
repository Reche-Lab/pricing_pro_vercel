import { NextResponse } from "next/server";
import { z } from "zod";
import type { CustomerRow } from "@/repositories/customers";
import { getCustomerById, updateCustomerExternalOlistId } from "@/repositories/customers";
import { buildOlistCustomerPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

const customerOverrideSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  personType: z.enum(["F", "J"]).optional(),
  document: z.string().trim().max(32).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional(),
  postalCode: z.string().trim().max(16).optional(),
  addressLine: z.string().trim().max(180).optional(),
  addressNumber: z.string().trim().max(40).optional(),
  addressComplement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });
  if (!loaded.detail.quote.customer_id) return NextResponse.json({ ok: false, error: "Quote has no customer." }, { status: 409 });

  const customer = await getCustomerById(loaded.session.userId, loaded.session.tenantId, loaded.detail.quote.customer_id);
  if (!customer) return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });

  const path = loaded.settings.customer_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist customer path is not configured." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const parsed = customerOverrideSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const customerForPayload = applyCustomerOverrides(customer, parsed.data);
  const payload = buildOlistCustomerPayload(customerForPayload, { personType: parsed.data.personType });
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "customers.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path,
      payload
    });
    if (result.externalId) {
      await updateCustomerExternalOlistId(loaded.session.userId, loaded.session.tenantId, customer.id, result.externalId);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}

function applyCustomerOverrides(customer: CustomerRow, input: z.infer<typeof customerOverrideSchema>): CustomerRow {
  return {
    ...customer,
    name: input.name || customer.name,
    document: input.document ?? customer.document,
    email: input.email ?? customer.email,
    phone: input.phone ?? customer.phone,
    postal_code: input.postalCode ?? customer.postal_code,
    address_line: input.addressLine ?? customer.address_line,
    address_number: input.addressNumber ?? customer.address_number,
    address_complement: input.addressComplement ?? customer.address_complement,
    district: input.district ?? customer.district,
    city: input.city ?? customer.city,
    state: input.state?.toUpperCase() ?? customer.state
  };
}
