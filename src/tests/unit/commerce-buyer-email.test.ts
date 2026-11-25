// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { sendStoreEmail } from "@/services/email/store-email";
import { requestBuyerCode } from "@/services/commerce/buyer-auth";
import { hashCommerceToken, type BuyerSession, type CommerceStore } from "@/repositories/commerce";

vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/services/email/store-email", () => ({ sendStoreEmail: vi.fn() }));
const query = vi.fn();
const store = { tenant_id: "tenant", slug: "loja", settings: { name: "Loja & Companhia", logoUrl: "https://cdn.example.com/logo.png", accent: "#26bfe8", contactEmail: "loja@example.com" } } as CommerceStore;
const session = { id: "session" } as BuyerSession;
beforeEach(() => {
  vi.clearAllMocks(); query.mockResolvedValue({ rows: [], rowCount: 1 });
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(sendStoreEmail).mockResolvedValue({ sent: true, provider: "smtp", message: "accepted" });
});

describe("buyer login email", () => {
  it("brands the code message and stores only its hash with the original tenant/session scope", async () => {
    const { challengeId } = await requestBuyerCode(store, session, "ana@example.com", "Ana <Cliente>");
    const mail = vi.mocked(sendStoreEmail).mock.calls[0][1];
    const code = /Seu código de acesso: (\d{6})/.exec(mail.text)![1];
    expect(mail.subject).toBe("Seu código de acesso - Loja & Companhia"); expect(mail.subject).not.toContain(code);
    expect(mail.html.match(new RegExp(code, "g"))).toHaveLength(1);
    expect(mail.html).toContain("Ana &lt;Cliente&gt;"); expect(mail.html).toContain('src="https://cdn.example.com/logo.png"');
    expect(mail.text).toContain("10 minutos · uso único"); expect(mail.text).toContain("Atendimento: loja@example.com");
    expect(query.mock.calls[0][1]).toEqual([challengeId, "tenant", "session", "ana@example.com", "Ana <Cliente>", hashCommerceToken(`${challengeId}:${code}`)]);
  });

  it("still invalidates the challenge when SMTP refuses delivery", async () => {
    vi.mocked(sendStoreEmail).mockResolvedValue({ sent: false, provider: "smtp", message: "rejected" });
    await expect(requestBuyerCode(store, session, "ana@example.com", "Ana")).rejects.toThrow("Não foi possível enviar");
    expect(query.mock.calls[1][0]).toContain("delete from commerce_login_challenges where tenant_id=$1 and id=$2");
    expect(query.mock.calls[1][1][0]).toBe("tenant");
  });
});
