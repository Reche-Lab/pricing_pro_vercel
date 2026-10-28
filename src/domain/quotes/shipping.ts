import { isQuoteAdministrativeEditingOpen } from "./quotes";

export function quoteShippingEditBlock(quote: {
  status?: string;
  public_accepted_at?: string | null;
  external_olist_invoice_id?: string | null;
  edit_reopened_at?: string | null;
  edit_relocked_at?: string | null;
}) {
  if (quote.external_olist_invoice_id) return "Este orçamento já tem nota fiscal. Ajuste a situação fiscal antes de alterar o frete.";
  if (["cancelled", "rejected", "expired"].includes(quote.status ?? "")) return "Este orçamento está encerrado e não permite alteração de frete.";
  if ((quote.status === "accepted" || quote.public_accepted_at) && !isQuoteAdministrativeEditingOpen({ editReopenedAt: quote.edit_reopened_at, editRelockedAt: quote.edit_relocked_at })) {
    return "Orçamento aprovado: reabra para edição na área administrativa antes de alterar o frete.";
  }
  return null;
}

export class QuoteShippingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function pickupNotes(notes: string | null) {
  return [...(notes ?? "").split("\n").filter(line => !/^(?:CEP (?:origem|destino):|Endere[cç]o destino:|Servi[cç]o de frete:|Frete inclu[ií]do:|Entrega: Retirada no local)/i.test(line.trim())), "Entrega: Retirada no local (sem cobrança de frete)."].filter(Boolean).join("\n");
}
