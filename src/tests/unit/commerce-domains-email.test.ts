import { describe, expect, it } from "vitest";
import { domainRequestSchema, dnsRecordSchema, dnsRecordName, canApproveDomain } from "@/domain/commerce/domain-setup";
import { storeEmailSchema } from "@/domain/commerce/store-email";
import { isPublicSmtpAddress } from "@/services/email/smtp-network";

describe("store domain setup boundaries", () => {
  it("accepts hostnames without URLs, ports, wildcards, local names or IP literals", () => {
    expect(domainRequestSchema.parse({ hostname: "GroundShop.com.br", provider: "Registro.br", includeWww: true }).hostname).toBe("groundshop.com.br");
    for (const hostname of ["https://groundshop.com.br", "localhost", "a.local", "127.0.0.1", "a.com:443", "*.a.com", "a.com/path"]) expect(domainRequestSchema.safeParse({ hostname, provider: "", includeWww: false }).success).toBe(false);
  });
  it("normalizes record names within the requested host and validates record values", () => {
    expect(dnsRecordName("@", "groundshop.com.br")).toBe("groundshop.com.br");
    expect(dnsRecordName("www", "groundshop.com.br")).toBe("www.groundshop.com.br");
    expect(dnsRecordName("_vercel.groundshop.com.br.", "groundshop.com.br")).toBe("_vercel.groundshop.com.br");
    expect(() => dnsRecordName("other.com", "groundshop.com.br")).toThrow();
    expect(dnsRecordSchema.safeParse({ type: "A", name: "@", value: "not-an-ip", ttl: 300 }).success).toBe(false);
    expect(dnsRecordSchema.safeParse({ type: "CNAME", name: "www", value: "project.vercel-dns.com", ttl: 300 }).success).toBe(true);
  });
  it("requires fresh DNS proof, expected records, Vercel and operator-confirmed HTTPS", () => {
    const row = { vercel_added_at: "2026-11-12", https_confirmed_at: "2026-11-12", expected_records: [{ type: "A" }], last_check: { checkedAt: new Date().toISOString(), ownership: true, records: [{ matched: true }] } };
    expect(canApproveDomain(row)).toBe(true);
    expect(canApproveDomain({ ...row, last_check: { ...row.last_check, ownership: false } })).toBe(false);
    expect(canApproveDomain({ ...row, https_confirmed_at: null })).toBe(false);
    expect(canApproveDomain({ ...row, last_check: { ...row.last_check, checkedAt: "2000-01-01" } })).toBe(false);
    expect(canApproveDomain({ ...row, expected_records: [] })).toBe(false);
  });
});
describe("tenant SMTP boundaries", () => {
  const settings = { host: "smtp.gmail.com", port: 587, username: "loja@example.com", fromEmail: "loja@example.com", fromName: "Ground Shop", replyTo: "", password: "secret", revision: 0 };
  it("allows only TLS SMTP ports and header-safe sender data", () => {
    expect(storeEmailSchema.safeParse(settings).success).toBe(true);
    for (const patch of [{ port: 25 }, { host: "127.0.0.1" }, { host: "smtp.local" }, { fromName: "Loja\r\nBcc: victim@example.com" }, { fromEmail: "invalid" }]) expect(storeEmailSchema.safeParse({ ...settings, ...patch }).success).toBe(false);
  });
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1"])("rejects private/special SMTP address %s", address => expect(isPublicSmtpAddress(address)).toBe(false));
  it("allows public addresses only", () => { expect(isPublicSmtpAddress("8.8.8.8")).toBe(true); expect(isPublicSmtpAddress("2606:4700:4700::1111")).toBe(true); });
});
