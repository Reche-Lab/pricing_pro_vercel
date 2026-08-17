import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env/server";

export type InviteEmailInput = {
  to: string;
  name: string;
  tenantName: string;
  inviteUrl: string;
  roleName?: string;
};

export type PasswordResetEmailInput = {
  to: string;
  name: string;
  temporaryPassword: string;
};

export type PublicQuoteOtpEmailInput = {
  to: string;
  name: string;
  tenantName: string;
  code: string;
  expiresMinutes: number;
};

export type InviteEmailResult = {
  sent: boolean;
  provider: "none" | "smtp";
  message: string;
};

export type AccessRequestConfirmationEmailInput = {
  to: string;
  name: string;
  companyName: string;
  verificationUrl: string;
  statusUrl: string;
};

export type AccessRequestReviewEmailInput = {
  to: string;
  name: string;
  companyName: string;
  status: "needs_information" | "rejected";
  message: string;
  statusUrl?: string | null;
};

export type LegalTermsAcceptanceEmailInput = {
  to: string;
  name: string;
  tenantName: string;
  termTitle: string;
  termVersion: string;
  acceptedAt: string;
  ipAddress?: string | null;
  contentText: string;
};

export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  return sendEmail({
    to: input.to,
    subject: `Convite para acessar ${input.tenantName}`,
    html: renderInviteHtml(input),
    text: renderInviteText(input)
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<InviteEmailResult> {
  return sendEmail({
    to: input.to,
    subject: "Nova senha de acesso",
    html: renderPasswordResetHtml(input),
    text: renderPasswordResetText(input)
  });
}

export async function sendPublicQuoteOtpEmail(input: PublicQuoteOtpEmailInput): Promise<InviteEmailResult> {
  const text = [
    `Olá, ${input.name}.`,
    "",
    `Seu código para confirmar o orçamento de ${input.tenantName} é: ${input.code}`,
    `O código expira em ${input.expiresMinutes} minutos.`,
    "",
    "Se você não solicitou este código, ignore esta mensagem."
  ].join("\n");
  return sendEmail({
    to: input.to,
    subject: `Código de acesso ao orçamento - ${input.tenantName}`,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #18181b; line-height: 1.5;">
        <h1 style="font-size: 20px;">Confirmação do orçamento</h1>
        <p>Olá, ${escapeHtml(input.name)}.</p>
        <p>Use o código abaixo para confirmar o orçamento de ${escapeHtml(input.tenantName)}:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; background: #f4f4f5; padding: 14px; border-radius: 8px; text-align: center;">${escapeHtml(input.code)}</p>
        <p style="font-size: 13px; color: #71717a;">O código expira em ${input.expiresMinutes} minutos. Se você não solicitou este código, ignore esta mensagem.</p>
      </div>`
  });
}

export async function sendAccessRequestConfirmationEmail(
  input: AccessRequestConfirmationEmailInput
): Promise<InviteEmailResult> {
  return sendEmail({
    to: input.to,
    subject: "Confirme sua solicitação de acesso ao Pricing Pro",
    text: [
      `Olá, ${input.name}.`,
      "",
      `Recebemos a solicitação de acesso para ${input.companyName}.`,
      "Confirme seu e-mail pelo link abaixo para enviá-la à análise:",
      input.verificationUrl,
      "",
      `Acompanhe a solicitação em: ${input.statusUrl}`,
      "O link de confirmação expira em 24 horas."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #18181b; line-height: 1.5;">
        <h1 style="font-size: 20px;">Confirme sua solicitação</h1>
        <p>Olá, ${escapeHtml(input.name)}.</p>
        <p>Recebemos a solicitação de acesso ao Pricing Pro para <strong>${escapeHtml(input.companyName)}</strong>.</p>
        <p><a href="${escapeAttribute(input.verificationUrl)}" style="display:inline-block;background:#0284c7;color:#fff;padding:11px 16px;border-radius:7px;text-decoration:none;font-weight:600;">Confirmar e-mail</a></p>
        <p style="font-size:13px;color:#71717a;">O link expira em 24 horas. Você pode acompanhar o andamento em <a href="${escapeAttribute(input.statusUrl)}">sua página de solicitação</a>.</p>
      </div>`
  });
}

export async function sendExistingAccountNotice(to: string, name: string, loginUrl: string): Promise<InviteEmailResult> {
  return sendEmail({
    to,
    subject: "Sua conta no Pricing Pro já existe",
    text: `Olá, ${name}.\n\nJá existe uma conta com este e-mail. Entre pelo endereço: ${loginUrl}\nCaso precise de outro tenant, fale com o suporte.`,
    html: `<div style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5"><h1 style="font-size:20px">Sua conta já existe</h1><p>Olá, ${escapeHtml(name)}.</p><p>Já existe uma conta com este e-mail. Use o acesso atual ou fale com o suporte caso precise de outro tenant.</p><p><a href="${escapeAttribute(loginUrl)}">Entrar no Pricing Pro</a></p></div>`
  });
}

export async function sendAccessRequestReviewEmail(input: AccessRequestReviewEmailInput): Promise<InviteEmailResult> {
  const title = input.status === "rejected" ? "Atualização da solicitação de acesso" : "Precisamos de mais informações";
  return sendEmail({
    to: input.to,
    subject: `${title} - Pricing Pro`,
    text: [`Olá, ${input.name}.`, "", title, input.message, input.statusUrl ? `Acompanhe em: ${input.statusUrl}` : ""].filter(Boolean).join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5"><h1 style="font-size:20px">${escapeHtml(title)}</h1><p>Olá, ${escapeHtml(input.name)}.</p><p>Sobre a solicitação de <strong>${escapeHtml(input.companyName)}</strong>:</p><div style="background:#f4f4f5;padding:12px;border-radius:7px">${escapeHtml(input.message)}</div>${input.statusUrl ? `<p><a href="${escapeAttribute(input.statusUrl)}">Acompanhar solicitação</a></p>` : ""}</div>`
  });
}

export async function sendLegalTermsAcceptanceEmail(
  input: LegalTermsAcceptanceEmailInput
): Promise<InviteEmailResult> {
  const acceptedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(input.acceptedAt));
  return sendEmail({
    to: input.to,
    subject: `Confirmação do aceite dos termos - ${input.tenantName}`,
    text: [
      `Olá, ${input.name}.`,
      "",
      `Registramos seu aceite de "${input.termTitle}" (versão ${input.termVersion}).`,
      `Empresa: ${input.tenantName}`,
      `Data: ${acceptedAt}`,
      input.ipAddress ? `IP: ${input.ipAddress}` : "",
      "",
      "Cópia do termo aceito:",
      input.contentText
    ].filter(Boolean).join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5"><h1 style="font-size:20px">Aceite registrado</h1><p>Olá, ${escapeHtml(input.name)}.</p><p>Registramos seu aceite dos termos do Pricing Pro para <strong>${escapeHtml(input.tenantName)}</strong>.</p><ul><li>Versão: ${escapeHtml(input.termVersion)}</li><li>Data: ${escapeHtml(acceptedAt)}</li>${input.ipAddress ? `<li>IP: ${escapeHtml(input.ipAddress)}</li>` : ""}</ul><hr><div style="white-space:pre-wrap;font-size:13px;color:#3f3f46">${escapeHtml(input.contentText)}</div></div>`
  });
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<InviteEmailResult> {
  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return {
      sent: false,
      provider: "none",
      message: "SMTP not configured. Invite link was generated for manual sending."
    };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    });

    return { sent: true, provider: "smtp", message: "Invite email sent." };
  } catch (error) {
    return {
      sent: false,
      provider: "smtp",
      message: error instanceof Error ? error.message : "SMTP rejected the invite email."
    };
  }
}

function renderInviteText(input: InviteEmailInput) {
  return [
    `Ola, ${input.name}.`,
    "",
    `Voce foi convidado para acessar ${input.tenantName}${input.roleName ? ` como ${input.roleName}` : ""}.`,
    "Use o link abaixo para definir sua senha e ativar o acesso:",
    input.inviteUrl,
    "",
    "Se voce nao esperava este convite, ignore esta mensagem."
  ].join("\n");
}

function renderInviteHtml(input: InviteEmailInput) {
  return `
    <div style="font-family: Arial, sans-serif; color: #18181b; line-height: 1.5;">
      <h1 style="font-size: 20px;">Convite para ${escapeHtml(input.tenantName)}</h1>
      <p>Ola, ${escapeHtml(input.name)}.</p>
      <p>Voce foi convidado para acessar ${escapeHtml(input.tenantName)}${input.roleName ? ` como ${escapeHtml(input.roleName)}` : ""}.</p>
      <p>
        <a href="${escapeAttribute(input.inviteUrl)}" style="display: inline-block; background: #18181b; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none;">
          Ativar acesso
        </a>
      </p>
      <p style="font-size: 13px; color: #71717a;">Se o botao nao funcionar, copie este link: ${escapeHtml(input.inviteUrl)}</p>
    </div>
  `;
}

function renderPasswordResetText(input: PasswordResetEmailInput) {
  return [
    `Ola, ${input.name}.`,
    "",
    "Recebemos uma solicitacao para redefinir sua senha.",
    `Sua senha temporaria e: ${input.temporaryPassword}`,
    "",
    "Acesse o sistema com esta senha e troque por uma senha definitiva em Configuracoes.",
    "Se voce nao solicitou esta alteracao, avise o administrador do seu tenant."
  ].join("\n");
}

function renderPasswordResetHtml(input: PasswordResetEmailInput) {
  return `
    <div style="font-family: Arial, sans-serif; color: #18181b; line-height: 1.5;">
      <h1 style="font-size: 20px;">Nova senha de acesso</h1>
      <p>Ola, ${escapeHtml(input.name)}.</p>
      <p>Recebemos uma solicitacao para redefinir sua senha.</p>
      <p style="font-size: 18px; font-weight: 700; background: #f4f4f5; padding: 12px; border-radius: 8px;">
        ${escapeHtml(input.temporaryPassword)}
      </p>
      <p>Acesse o sistema com esta senha e troque por uma senha definitiva em Configuracoes.</p>
      <p style="font-size: 13px; color: #71717a;">Se voce nao solicitou esta alteracao, avise o administrador do seu tenant.</p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
