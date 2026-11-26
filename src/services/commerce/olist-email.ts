import { createHash } from "node:crypto";
import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import type { CommerceOlistEmailReview, CommerceOlistJob } from "@/domain/commerce/olist";
import type { CommerceOrder } from "@/repositories/commerce";

type Row = Record<string, unknown>;
type Request = (path: string) => Promise<Row>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
export const sameOlistEmail = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
export function olistEmailRecipients(contactEmail: string, contactNfeEmail: string, invoiceEmail: string | null) {
  const values = [contactEmail, contactNfeEmail, invoiceEmail ?? ""].filter(Boolean);
  const valid = values.every(value => z.string().email().max(254).safeParse(value).success);
  const recipients = [...new Set(values.map(value => value.toLowerCase()))];
  return { olistRecipients: recipients, canUseOlistEmail: valid && recipients.length > 0 && (invoiceEmail === null || Boolean(invoiceEmail)) };
}

export function requireCommerceInvoiceEmail() {
  return new CommerceError("O e-mail de faturamento desta compra difere do destinatário no Olist. Confira os e-mails para corrigir o cadastro ou autorizar explicitamente o uso dos endereços já cadastrados no Olist.", 409, { code: "olist_email_update_required" });
}

export async function readCommerceOlistEmailReview(request: Request, order: CommerceOrder, job: Pick<CommerceOlistJob, "customer_id" | "invoice_id">, knownInvoice?: Row): Promise<CommerceOlistEmailReview> {
  const target = z.string().trim().email().max(254).safeParse(order.snapshot.billing?.email);
  if (!target.success || !job.customer_id || !/^[1-9]\d{0,14}$/.test(job.customer_id)) throw new CommerceError("Confira o cliente e o e-mail de faturamento desta compra.", 409);
  const document = digits(order.snapshot.billing?.document);
  const contact = await request(`/contatos/${job.customer_id}`);
  if (![11, 14].includes(document.length) || String(contact.id) !== job.customer_id || digits(contact.cpfCnpj) !== document)
    throw new CommerceError("O contato Olist não corresponde ao CPF/CNPJ de faturamento. Confira o vínculo antes de alterar o e-mail.", 409);
  if (["I", "E"].includes(String(contact.situacao))) throw new CommerceError("O contato Olist está inativo ou excluído. Confira o cadastro antes de continuar.", 409);
  const invoice = job.invoice_id ? knownInvoice ?? await request(`/notas/${job.invoice_id}`) : null;
  if (invoice && (String(invoice.id) !== job.invoice_id || digits(row(invoice.cliente).cpfCnpj) !== document || Math.round(Number(invoice.valor) * 100) !== order.total_cents || (row(invoice.cliente).id != null && String(row(invoice.cliente).id) !== job.customer_id)))
    throw new CommerceError("O cliente ou o total da nota diverge da compra. Confira os documentos no Olist antes de alterar o e-mail.", 409);
  if (invoice && Number(invoice.situacao) !== 1) throw new CommerceError("A nota não está pendente para emissão. Confira a situação no Olist; nenhuma nota será recriada ou cancelada.", 409);
  const contactEmail = text(contact.email), contactNfeEmail = text(contact.emailNfe);
  const invoiceEmail = invoice ? text(row(invoice.cliente).email) : null;
  const result = {
    customerId: job.customer_id, customerName: text(contact.nome), targetEmail: target.data, contactEmail, contactNfeEmail,
    invoiceId: job.invoice_id, invoiceNumber: invoice?.numero != null ? String(invoice.numero) : null, invoiceEmail,
    contactMatches: sameOlistEmail(contactEmail, target.data) && (!contactNfeEmail || sameOlistEmail(contactNfeEmail, target.data)),
    invoiceMatches: invoiceEmail === null || sameOlistEmail(invoiceEmail, target.data),
    ...olistEmailRecipients(contactEmail, contactNfeEmail, invoiceEmail),
  };
  return { ...result, reviewToken: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
}
