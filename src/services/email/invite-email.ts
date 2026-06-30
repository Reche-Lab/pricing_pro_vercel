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

export type InviteEmailResult = {
  sent: boolean;
  provider: "none" | "smtp";
  message: string;
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
