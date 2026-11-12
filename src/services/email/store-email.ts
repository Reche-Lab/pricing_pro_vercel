import nodemailer from "nodemailer";
import { decryptTenantSecret } from "@/lib/crypto/secrets";
import { loadStoreEmailConnection, type StoreEmailRow } from "@/repositories/commerce-store-email";
import { resolveSmtpAddress } from "./smtp-network";
import { sendEmail, type InviteEmailResult } from "./invite-email";

type Email = Parameters<typeof sendEmail>[0];
function smtpFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "connection";
  return { code, message: code === "EAUTH" ? "O SMTP recusou o acesso. Confira o usuário e a senha de aplicativo." : code === "EENVELOPE" ? "O SMTP recusou o remetente ou destinatário. Confira o e-mail autorizado no provedor." : "Não foi possível enviar pelo SMTP da empresa. Confira host público, porta, TLS e credenciais." };
}
export async function sendCustomStoreEmail(row: StoreEmailRow, input: Email): Promise<InviteEmailResult> {
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const address = await resolveSmtpAddress(row.host);
    const credentials = decryptTenantSecret<{ password: string }>(row.password_encrypted);
    transport = nodemailer.createTransport({
      host: address, port: row.port, secure: row.port === 465, requireTLS: row.port === 587,
      tls: { servername: row.host, rejectUnauthorized: true, minVersion: "TLSv1.2" },
      auth: { user: row.username, pass: credentials.password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    const result = await transport.sendMail({ from: { name: row.from_name, address: row.from_email }, replyTo: row.reply_to || undefined, ...input });
    if (!result.accepted?.length) throw Object.assign(new Error("SMTP did not accept the recipient."), { code: "EENVELOPE" });
    console.info("Commerce email accepted by SMTP.", { tenantId: row.tenant_id, transport: "tenant_smtp" });
    return { sent: true, provider: "smtp", message: "Mensagem aceita pelo SMTP. Confira a caixa de entrada e o spam; isso não garante a entrega final." };
  } catch (error) {
    const failure = smtpFailure(error);
    console.error("Commerce tenant email failed.", { tenantId: row.tenant_id, code: failure.code });
    return { sent: false, provider: "smtp", message: failure.message };
  } finally { transport?.close(); }
}
export async function sendStoreEmail(tenantId: string, input: Email): Promise<InviteEmailResult> {
  const row = await loadStoreEmailConnection(tenantId);
  // Once selected, the company's sender must not silently fall back to the platform's sender.
  return row?.enabled ? sendCustomStoreEmail(row, input) : sendEmail(input);
}
