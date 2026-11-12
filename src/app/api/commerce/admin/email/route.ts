import { z } from "zod";
import { storeEmailSchema } from "@/domain/commerce/store-email";
import { CommerceError } from "@/domain/commerce/commerce";
import { getStoreEmailSettings, saveStoreEmail, loadStoreEmailConnection, markStoreEmailTested, setStoreEmailEnabled } from "@/repositories/commerce-store-email";
import { sendCustomStoreEmail } from "@/services/email/store-email";
import { requireCommerceAdmin, checkCommerceOrigin, commerceJson, commerceFailure, readCommerceBody } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("toggle"), revision: z.number().int().positive(), enabled: z.boolean(), confirmReceived: z.boolean().optional() }).strict(),
]);
export async function GET() {
  try {
    const { session, profile } = await requireCommerceAdmin();
    return commerceJson({ settings: await getStoreEmailSettings(session.tenantId), testRecipient: profile.email, platformReady: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) });
  } catch (error) { return commerceFailure(error, "admin.email.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.email.save", limit: 15, windowSeconds: 600 }); if (blocked) return blocked;
    const settings = await saveStoreEmail(session.userId, session.tenantId, await readCommerceBody(request, storeEmailSchema, 8192));
    return commerceJson({ settings, message: settings.enabled ? "Configuração mantida e ativa." : "Configuração salva e desativada. Envie um teste antes de ativar." });
  } catch (error) { return commerceFailure(error, "admin.email.save"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const { session, profile } = await requireCommerceAdmin();
    const input = await readCommerceBody(request, actionSchema, 2048);
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: `commerce.email.${input.action}`, limit: input.action === "test" ? 3 : 10, windowSeconds: 600 }); if (blocked) return blocked;
    if (input.action === "toggle") {
      if (input.enabled && !input.confirmReceived) throw new CommerceError("Confirme o recebimento do e-mail de teste antes de ativar.");
      return commerceJson({ settings: await setStoreEmailEnabled(session.userId, session.tenantId, input.revision, input.enabled), message: input.enabled ? "Os códigos de acesso da loja serão enviados pelo e-mail da empresa." : "SMTP próprio desativado. A loja voltou ao remetente da plataforma, se configurado." });
    }
    const row = await loadStoreEmailConnection(session.tenantId);
    if (!row || row.revision !== input.revision) throw new CommerceError("Salve a configuração atual antes de testar.", 409);
    const result = await sendCustomStoreEmail(row, { to: profile.email, subject: "Teste do e-mail da sua loja", text: "Este é um teste do remetente da sua loja. Se recebeu esta mensagem, volte ao painel e ative o SMTP próprio para os códigos de acesso dos clientes.", html: "<p>Este é um teste do remetente da sua loja.</p><p>Se recebeu esta mensagem, volte ao painel e ative o SMTP próprio para os códigos de acesso dos clientes.</p>" });
    if (!result.sent) throw new CommerceError(result.message, 502);
    return commerceJson({ settings: await markStoreEmailTested(session.userId, session.tenantId, row.revision), message: result.message });
  } catch (error) { return commerceFailure(error, "admin.email.action"); }
}
