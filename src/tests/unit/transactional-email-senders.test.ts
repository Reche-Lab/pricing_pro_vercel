// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env/server";
import { sendAccessRequestConfirmationEmail, sendAccessRequestReviewEmail, sendEmail, sendExistingAccountNotice, sendInviteEmail, sendLegalTermsAcceptanceEmail, sendPasswordResetEmail, sendPublicQuoteOtpEmail } from "@/services/email/invite-email";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: vi.fn() }));
const sendMail = vi.fn();
const recipient = "ana@example.com";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerEnv).mockReturnValue({ SMTP_HOST: "smtp.example.com", SMTP_PORT: 587, SMTP_SECURE: "false", SMTP_USER: "sender@example.com", SMTP_PASS: "test-only" } as never);
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
  sendMail.mockResolvedValue({ accepted: [recipient] });
});

describe("transactional platform email senders", () => {
  it("applies the same branded document to every platform/customer template", async () => {
    await sendInviteEmail({ to: recipient, name: "Ana <Cliente>", tenantName: "Equipe & Loja\r\nOutro", roleName: "Editor", inviteUrl: "https://app.example.com/invite/123" });
    await sendPasswordResetEmail({ to: recipient, name: "Ana", temporaryPassword: "Temp<123>" });
    await sendPublicQuoteOtpEmail({ to: recipient, name: "Ana", tenantName: "Loja", code: "816329", expiresMinutes: 15 });
    await sendAccessRequestConfirmationEmail({ to: recipient, name: "Ana", companyName: "Empresa", verificationUrl: "https://app.example.com/verify/123", statusUrl: "https://app.example.com/status/123" });
    await sendExistingAccountNotice(recipient, "Ana", "https://app.example.com/login");
    await sendAccessRequestReviewEmail({ to: recipient, name: "Ana", companyName: "Empresa", status: "needs_information", message: "Confira <documento>.", statusUrl: "https://app.example.com/status/123" });
    await sendAccessRequestReviewEmail({ to: recipient, name: "Ana", companyName: "Empresa", status: "rejected", message: "Não aprovado." });
    await sendLegalTermsAcceptanceEmail({ to: recipient, name: "Ana", tenantName: "Empresa", termTitle: "Termos de uso", termVersion: "v1", acceptedAt: "2026-11-25T12:00:00Z", ipAddress: "192.0.2.1", contentText: "Texto integral\nTermo <literal>." });
    expect(sendMail).toHaveBeenCalledTimes(8);
    for (const [mail] of sendMail.mock.calls) {
      expect(mail.from).toBe("sender@example.com"); expect(mail.to).toBe(recipient);
      expect(mail.html).toContain('<!doctype html>'); expect(mail.html).toContain('<html lang="pt-BR">');
      expect(mail.html).toContain('role="presentation"'); expect(mail.text).toContain("Olá, Ana");
      expect(mail.subject).not.toMatch(/[\r\n]/);
    }
    expect(sendMail.mock.calls[0][0].html).toContain("Ana &lt;Cliente&gt;");
    expect(sendMail.mock.calls[1][0].html).toContain("Temp&lt;123&gt;");
    expect(sendMail.mock.calls[1][0].subject).not.toContain("Temp");
    expect(sendMail.mock.calls[2][0].html.match(/816329/g)).toHaveLength(1);
    expect(sendMail.mock.calls[2][0].text).toContain("15 minutos");
    expect(sendMail.mock.calls[5][0].html).toContain("Confira &lt;documento&gt;.");
    expect(sendMail.mock.calls[7][0].text).toContain("Texto integral\nTermo <literal>.");
    expect(sendMail.mock.calls[7][0].text).toContain("192.0.2.1");
  });

  it("preserves Message-ID for order notifications using the platform fallback", async () => {
    await sendEmail({ to: recipient, subject: "Atualização", html: "<p>Atualização</p>", text: "Atualização", messageId: "<notification@example.com>" });
    expect(sendMail.mock.calls[0][0].messageId).toBe("<notification@example.com>");
  });

  it("preserves the existing unconfigured/failed SMTP results without sending real mail", async () => {
    vi.mocked(getServerEnv).mockReturnValue({} as never);
    expect((await sendPasswordResetEmail({ to: recipient, name: "Ana", temporaryPassword: "test" })).provider).toBe("none");
    expect(sendMail).not.toHaveBeenCalled();
    vi.mocked(getServerEnv).mockReturnValue({ SMTP_HOST: "smtp.example.com", SMTP_USER: "sender", SMTP_PASS: "test" } as never);
    sendMail.mockRejectedValueOnce(new Error("SMTP rejected"));
    expect((await sendExistingAccountNotice(recipient, "Ana", "https://app.example.com/login")).sent).toBe(false);
  });
});
