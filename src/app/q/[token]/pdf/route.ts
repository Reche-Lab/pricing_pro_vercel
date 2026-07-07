import { notFound } from "next/navigation";
import { getPublicQuoteByToken } from "@/repositories/quotes";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 20) notFound();

  const detail = await getPublicQuoteByToken(token);
  if (!detail) notFound();

  const pdf = await generateQuotePdf({
    tenantName: detail.tenant.name,
    tenant: detail.tenant,
    quote: detail.quote,
    items: detail.items
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="orcamento-${detail.quote.id}.pdf"`
    }
  });
}
