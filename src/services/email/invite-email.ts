import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env/server";
import { renderTransactionalEmail } from "./email-layout";

export type InviteEmailInput = { to: string; name: string; tenantName: string; inviteUrl: string; roleName?: string };
export type PasswordResetEmailInput = { to: string; name: string; temporaryPassword: string };
export type PublicQuoteOtpEmailInput = { to: string; name: string; tenantName: string; code: string; expiresMinutes: number };
export type InviteEmailResult = { sent: boolean; provider: "none" | "smtp"; message: string };
export type AccessRequestConfirmationEmailInput = { to: string; name: string; companyName: string; verificationUrl: string; statusUrl: string };
export type AccessRequestReviewEmailInput = { to: string; name: string; companyName: string; status: "needs_information" | "rejected"; message: string; statusUrl?: string | null };
export type LegalTermsAcceptanceEmailInput = { to: string; name: string; tenantName: string; termTitle: string; termVersion: string; acceptedAt: string; ipAddress?: string | null; contentText: string };

const platformBrand = { name: "Pricing Pro", accent: "#126352" };
const subject = (value: string) => value.replace(/[\r\n]/g, " ");

export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  return sendEmail({ to: input.to, subject: subject(`Convite para acessar ${input.tenantName}`),
    ...renderTransactionalEmail({
      brand: { ...platformBrand, name: input.tenantName }, title: "Seu convite chegou", eyebrow: "Convite para a equipe",
      preheader: "Defina sua senha para ativar o acesso à sua equipe.", greeting: `Olá, ${input.name}.`,
      paragraphs: [`Você foi convidado para acessar ${input.tenantName}${input.roleName ? ` como ${input.roleName}` : ""}.`, "Defina sua senha para ativar seu acesso pelo botão abaixo."],
      action: { label: "Ativar meu acesso", url: input.inviteUrl },
      notice: "Este convite é pessoal. Se você não esperava esta mensagem, ignore-a ou confirme com a pessoa responsável pela sua equipe.",
    }) });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<InviteEmailResult> {
  return sendEmail({ to: input.to, subject: "Nova senha de acesso",
    ...renderTransactionalEmail({
      brand: platformBrand, title: "Seu acesso foi atualizado", eyebrow: "Segurança da sua conta",
      preheader: "Confira as instruções para recuperar seu acesso com segurança.", greeting: `Olá, ${input.name}.`,
      paragraphs: ["Recebemos uma solicitação para redefinir sua senha. Use a senha temporária abaixo para acessar o sistema."],
      code: { label: "Sua senha temporária", value: input.temporaryPassword, note: "Troque por uma senha definitiva em Configurações após entrar." },
      notice: "Não compartilhe esta senha. Se você não solicitou a alteração, avise o administrador da sua empresa.",
    }) });
}

export async function sendPublicQuoteOtpEmail(input: PublicQuoteOtpEmailInput): Promise<InviteEmailResult> {
  return sendEmail({ to: input.to, subject: subject(`Código de acesso ao orçamento - ${input.tenantName}`),
    ...renderTransactionalEmail({
      brand: { ...platformBrand, name: input.tenantName }, title: "Confirme o acesso ao orçamento", eyebrow: "Seu orçamento, com segurança",
      preheader: `Seu código de confirmação é válido por ${input.expiresMinutes} minutos.`, greeting: `Olá, ${input.name}.`,
      paragraphs: [`Use o código abaixo na página do orçamento de ${input.tenantName} para confirmar seu acesso.`],
      code: { label: "Código de confirmação", value: input.code, note: `Válido por ${input.expiresMinutes} minutos. Use somente na página em que solicitou o código.` },
      notice: "Se você não solicitou este código, ignore a mensagem. Nossa equipe nunca pede códigos de acesso por telefone ou conversa.",
    }) });
}

export async function sendAccessRequestConfirmationEmail(input: AccessRequestConfirmationEmailInput): Promise<InviteEmailResult> {
  return sendEmail({ to: input.to, subject: "Confirme sua solicitação de acesso ao Pricing Pro",
    ...renderTransactionalEmail({
      brand: platformBrand, title: "Vamos confirmar seu e-mail", eyebrow: "Solicitação de acesso",
      preheader: "Confirme seu e-mail para enviar sua solicitação à análise.", greeting: `Olá, ${input.name}.`,
      paragraphs: [`Recebemos a solicitação de acesso para ${input.companyName}. Confirme seu e-mail para enviá-la à análise.`],
      facts: [{ label: "Empresa", value: input.companyName }, { label: "Validade do link", value: "24 horas" }],
      action: { label: "Confirmar meu e-mail", url: input.verificationUrl },
      secondaryLinks: [{ label: "Acompanhar minha solicitação", url: input.statusUrl }],
      notice: "A confirmação do e-mail não libera o acesso automaticamente. Você poderá acompanhar a análise na página da solicitação.",
    }) });
}

export async function sendExistingAccountNotice(to: string, name: string, loginUrl: string): Promise<InviteEmailResult> {
  return sendEmail({ to, subject: "Sua conta no Pricing Pro já existe",
    ...renderTransactionalEmail({
      brand: platformBrand, title: "Você já tem uma conta", eyebrow: "Acesso ao Pricing Pro",
      preheader: "Use seu acesso atual para entrar na plataforma.", greeting: `Olá, ${name}.`,
      paragraphs: ["Já existe uma conta com este e-mail. Use seu acesso atual para entrar. Caso precise de outra empresa na plataforma, fale com o suporte."],
      action: { label: "Entrar no Pricing Pro", url: loginUrl },
    }) });
}

export async function sendAccessRequestReviewEmail(input: AccessRequestReviewEmailInput): Promise<InviteEmailResult> {
  const title = input.status === "rejected" ? "Atualização da solicitação de acesso" : "Precisamos de mais informações";
  return sendEmail({ to: input.to, subject: `${title} - Pricing Pro`,
    ...renderTransactionalEmail({
      brand: platformBrand, title, eyebrow: "Análise da solicitação",
      preheader: "Há uma atualização sobre sua solicitação de acesso.", greeting: `Olá, ${input.name}.`,
      paragraphs: [`Temos uma atualização sobre a solicitação de ${input.companyName}.`],
      sections: [{ title: "Mensagem da equipe", lines: [input.message] }],
      action: input.statusUrl ? { label: "Acompanhar solicitação", url: input.statusUrl } : undefined,
    }) });
}

export async function sendLegalTermsAcceptanceEmail(input: LegalTermsAcceptanceEmailInput): Promise<InviteEmailResult> {
  const acceptedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(input.acceptedAt));
  return sendEmail({ to: input.to, subject: subject(`Confirmação do aceite dos termos - ${input.tenantName}`),
    ...renderTransactionalEmail({
      brand: platformBrand, title: "Seu aceite foi registrado", eyebrow: "Comprovante de aceite",
      preheader: "Guarde esta mensagem com a cópia dos termos aceitos.", greeting: `Olá, ${input.name}.`,
      paragraphs: [`Registramos seu aceite de “${input.termTitle}”. Guarde esta mensagem para consulta.`],
      facts: [{ label: "Empresa", value: input.tenantName }, { label: "Versão", value: input.termVersion }, { label: "Data do aceite", value: acceptedAt }, ...(input.ipAddress ? [{ label: "IP", value: input.ipAddress }] : [])],
      legalText: input.contentText,
    }) });
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string; messageId?: string }): Promise<InviteEmailResult> {
  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return { sent: false, provider: "none", message: "SMTP not configured. Invite link was generated for manual sending." };
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === "true",
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  try {
    await transporter.sendMail({
      from: env.SMTP_USER, to: input.to, subject: input.subject, html: input.html, text: input.text,
      ...(input.messageId ? { messageId: input.messageId } : {}),
    });
    return { sent: true, provider: "smtp", message: "Invite email sent." };
  } catch (error) {
    return { sent: false, provider: "smtp", message: error instanceof Error ? error.message : "SMTP rejected the invite email." };
  }
}
