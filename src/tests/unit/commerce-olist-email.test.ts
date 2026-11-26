// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readCommerceOlistEmailReview } from "@/services/commerce/olist-email";
import type { CommerceOrder } from "@/repositories/commerce";
import { consentForOlistEmail, consentAllowsOlistEmail, latestOlistEmailConsent } from "@/services/commerce/olist-email-consent";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import type { PoolClient } from "pg";

const billing = { document: "52998224725", email: "purchase@example.test" };
const order = { id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222", total_cents: 2890, snapshot: { billing, customer: { email: "login@example.test" } } } as CommerceOrder;
const job = { customer_id: "11", invoice_id: "33" };
const contact = { id: 11, nome: "Cliente", cpfCnpj: "529.982.247-25", situacao: "B", email: "old@example.test", emailNfe: "old-fiscal@example.test", endereco: { municipio: "Private" } };
const invoice = { id: 33, numero: "224", situacao: 1, valor: 28.9, cliente: { id: 11, cpfCnpj: billing.document, email: "old-invoice@example.test" } };

describe("Olist billing email review", () => {
  it("binds consent to this tenant, order, contact, invoice, purchase and the displayed ERP addresses", async () => {
    const review = await readCommerceOlistEmailReview(vi.fn(async () => contact), order, job, invoice);
    expect(review).toMatchObject({ canUseOlistEmail: true, olistRecipients: ["old@example.test", "old-fiscal@example.test", "old-invoice@example.test"] });
    const consent = consentForOlistEmail(order, review, "33333333-3333-4333-8333-333333333333");
    expect(consentAllowsOlistEmail(consent, order, review)).toBe(true);
    for (const changed of [{ ...review, customerId: "12" }, { ...review, invoiceId: "44" }, { ...review, targetEmail: "new-purchase@example.test" }, { ...review, contactNfeEmail: "new-fiscal@example.test" }, { ...review, olistRecipients: [...review.olistRecipients, "new-note@example.test"] }])
      expect(consentAllowsOlistEmail(consent, order, changed)).toBe(false);
    expect(consentAllowsOlistEmail(consent, { ...order, total_cents: 3000 }, review)).toBe(false);
    expect(consentAllowsOlistEmail(consent, { ...order, tenant_id: "44444444-4444-4444-8444-444444444444" }, review)).toBe(false);
    expect(consentAllowsOlistEmail(consent, { ...order, id: "55555555-5555-4555-8555-555555555555" }, review)).toBe(false);
  });
  it("does not enable ERP consent for empty or malformed invoice and registration emails", async () => {
    for (const current of [{ ...contact, email: "invalid" }, { ...contact, emailNfe: "a@example.test;b@example.test" }]) {
      const review = await readCommerceOlistEmailReview(vi.fn(async () => current), order, job, invoice);
      expect(review.canUseOlistEmail).toBe(false);
    }
    const emptyNote = await readCommerceOlistEmailReview(vi.fn(async () => contact), order, job, { ...invoice, cliente: { ...invoice.cliente, email: "" } });
    expect(emptyNote.canUseOlistEmail).toBe(false);
  });
  it("loads only encrypted durable consent and honors a later purchase-email update request as revocation", async () => {
    const review = await readCommerceOlistEmailReview(vi.fn(async () => contact), order, job, invoice);
    const consent = consentForOlistEmail(order, review, "33333333-3333-4333-8333-333333333333");
    const query = vi.fn().mockResolvedValue({ rows: [{ type: "olist.email_recipient_approved", metadata: { consent_encrypted: encryptTenantSecret(consent) } }] });
    const client = { query } as unknown as PoolClient;
    expect(await latestOlistEmailConsent(client, order.tenant_id, order.id)).toEqual(consent);
    expect(query.mock.calls[0][1]).toEqual([order.tenant_id, order.id]);
    query.mockResolvedValue({ rows: [{ type: "olist.email_update_requested", metadata: { consent_encrypted: encryptTenantSecret(consent) } }] });
    expect(await latestOlistEmailConsent(client, order.tenant_id, order.id)).toBeNull();
    query.mockResolvedValue({ rows: [{ type: "olist.email_recipient_approved", metadata: { consent_encrypted: "forged", ...consent } }] });
    expect(await latestOlistEmailConsent(client, order.tenant_id, order.id)).toBeNull();
  });
  it("uses the frozen billing email, not the login or ERP address, and returns a minimal comparison", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/contatos/") ? contact : invoice);
    const result = await readCommerceOlistEmailReview(request, order, job);
    expect(result).toMatchObject({ targetEmail: "purchase@example.test", contactEmail: "old@example.test", contactNfeEmail: "old-fiscal@example.test", invoiceEmail: "old-invoice@example.test", invoiceNumber: "224", contactMatches: false, invoiceMatches: false });
    expect(result.reviewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("Private"); expect(JSON.stringify(result)).not.toContain("login@example.test");
    expect(request.mock.calls.map(call => call[0])).toEqual(["/contatos/11", "/notas/33"]);
  });
  it("normalizes email case, supports an inherited fiscal address and detects stale comparisons", async () => {
    const current = { ...contact, email: "PURCHASE@example.test ", emailNfe: "" };
    const request = vi.fn(async () => current);
    const matching = { ...invoice, cliente: { ...invoice.cliente, email: "Purchase@example.test" } };
    const first = await readCommerceOlistEmailReview(request, order, job, matching);
    expect(first).toMatchObject({ contactMatches: true, invoiceMatches: true });
    expect(request).toHaveBeenCalledTimes(1);
    const second = await readCommerceOlistEmailReview(vi.fn(async () => ({ ...current, emailNfe: "other@example.test" })), order, job, matching);
    expect(second.contactMatches).toBe(false); expect(second.reviewToken).not.toBe(first.reviewToken);
  });
  it("supports checking the contact before generating a new invoice", async () => {
    const request = vi.fn(async () => contact);
    expect(await readCommerceOlistEmailReview(request, order, { ...job, invoice_id: null })).toMatchObject({ invoiceId: null, invoiceEmail: null, invoiceMatches: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects wrong contacts, documents and fiscal totals", async () => {
    for (const invalid of [{ ...contact, id: 12 }, { ...contact, cpfCnpj: "11144477735" }, { ...contact, situacao: "I" }])
      await expect(readCommerceOlistEmailReview(vi.fn(async () => invalid), order, job, invoice)).rejects.toThrow();
    for (const invalid of [{ ...invoice, id: 44 }, { ...invoice, valor: 99 }, { ...invoice, cliente: { ...invoice.cliente, id: 12 } }, { ...invoice, cliente: { ...invoice.cliente, cpfCnpj: "11144477735" } }])
      await expect(readCommerceOlistEmailReview(vi.fn(async () => contact), order, job, invalid)).rejects.toThrow(/diverge/);
  });
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])("never permits a fiscal email correction for invoice status %s", async situacao => {
    await expect(readCommerceOlistEmailReview(vi.fn(async () => contact), order, job, { ...invoice, situacao })).rejects.toThrow(/não está pendente/);
  });
});
