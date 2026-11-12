// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendStoreEmail } from "@/services/email/store-email";
import { loadStoreEmailConnection } from "@/repositories/commerce-store-email";
import { sendEmail } from "@/services/email/invite-email";
import { resolveSmtpAddress } from "@/services/email/smtp-network";
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
vi.mock("@/repositories/commerce-store-email", () => ({ loadStoreEmailConnection: vi.fn() }));
vi.mock("@/lib/crypto/secrets", () => ({ decryptTenantSecret: () => ({ password: "private-test-password" }) }));
vi.mock("@/services/email/smtp-network", () => ({ resolveSmtpAddress: vi.fn() }));
vi.mock("@/services/email/invite-email", () => ({ sendEmail: vi.fn() }));
const row = { tenant_id: "tenant", host: "smtp.example.com", port: 587 as const, username: "user", from_name: "Ground Shop", from_email: "loja@example.com", reply_to: "atendimento@example.com", password_encrypted: "encrypted", enabled: true, revision: 1, tested_revision: 1, tested_at: "2026-11-12" };
const email = { to: "buyer@example.com", subject: "Acesso", html: "<p>Código</p>", text: "Código" };
beforeEach(() => {
  vi.clearAllMocks(); smtp.create.mockReturnValue(smtp); smtp.sendMail.mockResolvedValue({ accepted: [email.to] });
  vi.mocked(loadStoreEmailConnection).mockResolvedValue(row); vi.mocked(resolveSmtpAddress).mockResolvedValue("8.8.8.8");
  vi.mocked(sendEmail).mockResolvedValue({ sent: true, provider: "smtp", message: "platform" });
});
describe("tenant sender routing", () => {
  it("uses the platform only when custom SMTP is absent or disabled", async () => {
    vi.mocked(loadStoreEmailConnection).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...row, enabled: false });
    await sendStoreEmail("one", email); await sendStoreEmail("two", email);
    expect(sendEmail).toHaveBeenCalledTimes(2); expect(smtp.create).not.toHaveBeenCalled();
  });
  it.each([587, 465] as const)("uses the tenant identity with pinned public IP and validated TLS on port %s", async port => {
    vi.mocked(loadStoreEmailConnection).mockResolvedValue({ ...row, port });
    expect((await sendStoreEmail("tenant", email)).sent).toBe(true);
    expect(smtp.create).toHaveBeenCalledWith(expect.objectContaining({ host: "8.8.8.8", secure: port === 465, requireTLS: port === 587, tls: { servername: row.host, rejectUnauthorized: true, minVersion: "TLSv1.2" } }));
    expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: { name: "Ground Shop", address: "loja@example.com" }, replyTo: row.reply_to, to: email.to }));
    expect(sendEmail).not.toHaveBeenCalled(); expect(smtp.close).toHaveBeenCalled();
  });
  it("does not fall back or expose SMTP errors containing credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("private-test-password rejected by smtp"), { code: "EAUTH" }));
    const result = await sendStoreEmail("tenant", email);
    expect(result).toMatchObject({ sent: false, message: expect.stringContaining("senha de aplicativo") });
    expect(JSON.stringify([result, log.mock.calls])).not.toContain("private-test-password");
    expect(sendEmail).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("does not open a connection if DNS resolves to an unsafe destination", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveSmtpAddress).mockRejectedValue(new Error("private destination"));
    expect((await sendStoreEmail("tenant", email)).sent).toBe(false);
    expect(smtp.create).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); log.mockRestore();
  });
});
