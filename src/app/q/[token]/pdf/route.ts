import { notFound } from "next/navigation";
import { getPublicQuoteByToken } from "@/repositories/quotes";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 20) notFound();
  const limited = await enforcePublicRateLimit(request, token, { action: "quote-pdf", limit: 20, windowSeconds: 3600 });
  if (limited) return limited;
  const artworkVariant = z.enum(["original", "edited", "cropped"])
    .safeParse(new URL(request.url).searchParams.get("artwork") ?? "original");
  if (!artworkVariant.success) notFound();

  const detail = await getPublicQuoteByToken(token);
  if (!detail) notFound();

  const pdf = await generateQuotePdf({
    tenantName: detail.tenant.name,
    tenant: detail.tenant,
    quote: detail.quote,
    items: detail.items,
    artworkVariant: artworkVariant.data
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="orcamento-${detail.quote.id}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff"
    }
  });
}
