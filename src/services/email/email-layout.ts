export type EmailBrand = { name: string; url?: string | null; logoUrl?: string | null; accent?: string | null; contactEmail?: string | null; contactPhone?: string | null };
export type EmailFact = { label: string; value: string };
export type EmailOrderSummary = {
  code: string; date?: string; items: Array<{ name: string; quantity: number; unitCents: number; totalCents: number; artworkName?: string }>;
  subtotalCents: number; shippingCents: number; totalCents: number; artworkDiscountCents?: number;
};
export type TransactionalEmail = {
  brand: EmailBrand; title: string; preheader: string; eyebrow?: string; greeting?: string;
  paragraphs?: string[]; code?: { label: string; value: string; note: string };
  facts?: EmailFact[]; sections?: Array<{ title: string; lines: string[] }>;
  summary?: EmailOrderSummary; tracking?: Array<{ code: string | null; url: string | null }>;
  action?: { label: string; url: string }; secondaryLinks?: Array<{ label: string; url: string }>;
  notice?: string; legalText?: string; footerNote?: string;
};

export const escapeEmailHtml = (value: string) => value.replace(/[&<>"'`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[character]!);
export function emailHttpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const escape = escapeEmailHtml;
function colors(value?: string | null) {
  const accent = /^#[\da-f]{6}$/i.test(value ?? "") ? value! : "#126352";
  const rgb = [1, 3, 5].map(offset => parseInt(accent.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const light = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  return { accent, onAccent: light > .179 ? "#000000" : "#ffffff", link: light < .18 ? accent : "#126352" };
}
function summaryHtml(summary: EmailOrderSummary) {
  const rows = summary.items.map(item => `<tr><td style="padding:16px 0;border-bottom:1px solid #e5ebee;vertical-align:top;overflow-wrap:anywhere;word-break:break-word"><strong style="font-size:14px;color:#20343d">${escape(item.name)}</strong>${item.artworkName ? `<div style="font-size:12px;color:#637680;margin-top:4px">Arte: ${escape(item.artworkName)}</div>` : ""}<div style="font-size:12px;color:#637680;margin-top:5px">${item.quantity.toLocaleString("pt-BR")} un. × ${money(item.unitCents)}</div></td><td width="110" align="right" style="padding:16px 0 16px 10px;border-bottom:1px solid #e5ebee;vertical-align:top;white-space:nowrap;font-size:14px;font-weight:700;color:#20343d">${money(item.totalCents)}</td></tr>`).join("");
  const benefit = summary.artworkDiscountCents ?? 0;
  const line = (label: string, value: string, total = false) => `<tr><td style="padding:${total ? "16px 0 0" : "6px 0"};${total ? "border-top:1px solid #dbe5e9;font-weight:700;color:#20343d;font-size:17px" : "font-size:13px;color:#637680"}">${escape(label)}</td><td align="right" style="padding:${total ? "16px 0 0" : "6px 0"};white-space:nowrap;${total ? "border-top:1px solid #dbe5e9;font-weight:700;color:#20343d;font-size:19px" : "font-size:13px;color:#20343d"}">${escape(value)}</td></tr>`;
  return `<h2 style="margin:30px 0 4px;font-size:17px;color:#20343d">Resumo do pedido</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody>${rows}</tbody></table><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px"><tbody>${line(benefit > 0 ? "Produtos antes do benefício" : "Produtos", money(summary.subtotalCents + benefit))}${benefit > 0 ? line("Desconto por arte pronta", `−${money(benefit)}`) : ""}${line("Entrega", money(summary.shippingCents))}${line("Total do pedido", money(summary.totalCents), true)}</tbody></table>`;
}

/** Table layout and inline essentials keep the message useful when email clients strip CSS. */
export function renderTransactionalEmail(input: TransactionalEmail) {
  const { brand } = input, palette = colors(brand.accent);
  const brandUrl = emailHttpsUrl(brand.url), logo = emailHttpsUrl(brand.logoUrl);
  const actionUrl = emailHttpsUrl(input.action?.url);
  const contact = typeof brand.contactEmail === "string" && /^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(brand.contactEmail) ? brand.contactEmail : null;
  const contactUrl = contact ? `mailto:${encodeURIComponent(contact).replace(/%40/g, "@")}` : null;
  const footerNote = input.footerNote || "Mensagem enviada em razão da sua solicitação ou do seu pedido. Não compartilhe senhas ou códigos de acesso.";
  const facts = [...(input.summary ? [{ label: "Pedido", value: `#${input.summary.code}` }, ...(input.summary.date ? [{ label: "Realizado em", value: input.summary.date }] : [])] : []), ...(input.facts ?? [])];
  const title = escape(input.title);
  const action = actionUrl && input.action ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 16px"><tr><td bgcolor="${palette.accent}" style="border:1px solid #d4e4de;border-radius:6px;mso-padding-alt:14px 22px"><a class="mail-action" href="${escape(actionUrl)}" style="display:inline-block;padding:14px 22px;font-size:14px;line-height:1.4;font-weight:700;background:${palette.accent};color:${palette.onAccent};text-decoration:none;border-radius:6px">${escape(input.action.label)}</a></td></tr></table><p style="font-size:11px;line-height:1.7;color:#637680;margin:0 0 10px;word-break:break-all">Se o botão não abrir, copie este endereço:<br>${escape(actionUrl)}</p>` : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}img{-ms-interpolation-mode:bicubic}@media only screen and (max-width:480px){.mail-padding{padding-left:20px!important;padding-right:20px!important}.mail-title{font-size:24px!important;line-height:1.3!important}.mail-outer{padding:12px 8px!important}.mail-action{display:block!important;text-align:center!important}.mail-code{font-size:32px!important}}</style></head>
  <body style="margin:0;padding:0;background:#edf2f4;font-family:Arial,Helvetica,sans-serif;letter-spacing:0;color:#20343d">
  <div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escape(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#edf2f4"><tr><td class="mail-outer" align="center" style="padding:32px 16px">
  <!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:640px;table-layout:fixed;background:#ffffff;border:1px solid #dce5e9;border-radius:8px;overflow:hidden"><tr><td height="5" bgcolor="${palette.accent}" style="height:5px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td class="mail-padding" style="padding:28px 32px 24px;border-bottom:1px solid #e5ebee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${logo ? `<td width="60" style="padding-right:12px;vertical-align:middle"><img src="${escape(logo)}" width="48" height="48" alt="${escape(brand.name)}" style="display:block;width:48px;height:48px;object-fit:contain;border:0;border-radius:6px"></td>` : ""}<td style="vertical-align:middle;overflow-wrap:anywhere;word-break:break-word"><strong style="display:block;font-size:20px;line-height:1.3;color:#20343d">${escape(brand.name)}</strong><span style="display:block;margin-top:5px;font-size:11px;color:#637680">${escape(input.eyebrow || "Uma mensagem para você")}</span></td></tr></table></td></tr>
  <tr><td class="mail-padding" style="padding:30px 32px 32px"><h1 class="mail-title" style="font-size:28px;line-height:1.25;margin:0 0 20px;color:#20343d;font-weight:700">${title}</h1>
  ${input.greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7">${escape(input.greeting)}</p>` : ""}
  ${(input.paragraphs ?? []).map(text => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#4c626e;overflow-wrap:anywhere">${escape(text)}</p>`).join("")}
  ${input.code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f0f6f4;border:1px solid #d4e4de;border-radius:6px"><tr><td align="center" style="padding:20px 12px"><p style="font-size:12px;color:#526c61;margin:0 0 10px">${escape(input.code.label)}</p><p class="mail-code" style="font-family:Consolas,Monaco,monospace;font-size:36px;line-height:1.4;font-weight:700;color:#183c30;margin:0;letter-spacing:0;word-break:break-all">${escape(input.code.value)}</p><p style="font-size:12px;color:#526c61;margin:10px 0 0">${escape(input.code.note)}</p></td></tr></table>` : ""}
  ${facts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:#f5f8f9;border:1px solid #e1e9ed;border-radius:6px"><tbody>${facts.map(fact => `<tr><td width="40%" style="padding:10px 14px;font-size:12px;color:#637680;vertical-align:top">${escape(fact.label)}</td><td style="padding:10px 14px;font-size:13px;color:#20343d;vertical-align:top;overflow-wrap:anywhere">${escape(fact.value)}</td></tr>`).join("")}</tbody></table>` : ""}
  ${action}
  ${input.summary ? summaryHtml(input.summary) : ""}
  ${(input.sections ?? []).map(section => `<h2 style="margin:28px 0 10px;font-size:16px;color:#20343d">${escape(section.title)}</h2>${section.lines.map(line => `<p style="font-size:13px;line-height:1.7;color:#4c626e;margin:4px 0;overflow-wrap:anywhere">${escape(line)}</p>`).join("")}`).join("")}
  ${(input.tracking ?? []).map((tracking, index) => { const url = emailHttpsUrl(tracking.url); return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #d4e4de;border-radius:6px;background:#f0f6f4"><tr><td style="padding:16px"><strong style="font-size:13px;color:#20343d">${(input.tracking?.length ?? 0) > 1 ? `Volume ${index + 1} · ` : ""}Rastreamento</strong>${tracking.code ? `<p style="font-family:Consolas,Monaco,monospace;overflow-wrap:anywhere;color:#183c30;font-size:17px;margin:8px 0">${escape(tracking.code)}</p>` : ""}${url ? `<a href="${escape(url)}" style="font-size:13px;color:${palette.link};text-decoration:underline">Rastrear entrega</a>` : ""}</td></tr></table>`; }).join("")}
  ${input.notice ? `<p style="font-size:12px;line-height:1.7;color:#526c61;border-left:3px solid #9ac8b3;padding:10px 14px;background:#f4f8f6;margin:24px 0">${escape(input.notice)}</p>` : ""}
  ${(input.secondaryLinks ?? []).map(link => { const url = emailHttpsUrl(link.url); return url ? `<p style="font-size:13px;margin:14px 0"><a href="${escape(url)}" style="color:${palette.link};text-decoration:underline">${escape(link.label)}</a></p>` : ""; }).join("")}
  ${input.legalText ? `<h2 style="margin:28px 0 12px;font-size:16px;color:#20343d">Cópia do documento aceito</h2><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.8;color:#4c626e">${escape(input.legalText)}</div>` : ""}
  </td></tr><tr><td class="mail-padding" style="padding:24px 32px;background:#f7f9fa;border-top:1px solid #e1e9ed"><strong style="font-size:13px;color:#20343d">${escape(brand.name)}</strong>${contact || brand.contactPhone ? `<p style="font-size:12px;line-height:1.8;color:#637680;margin:8px 0">Precisa de ajuda? ${contact ? `<a href="${escape(contactUrl!)}" style="color:${palette.link};text-decoration:underline">${escape(contact)}</a>` : ""}${contact && brand.contactPhone ? " · " : ""}${brand.contactPhone ? escape(brand.contactPhone) : ""}</p>` : ""}${brandUrl ? `<p style="font-size:12px;line-height:1.7;margin:8px 0"><a href="${escape(brandUrl)}" style="color:${palette.link};text-decoration:underline">Visitar ${escape(brand.name)}</a></p>` : ""}<p style="font-size:11px;line-height:1.7;color:#637680;margin:10px 0 0">${escape(footerNote)}</p></td></tr></table>
  <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table></body></html>`;
  const text = [brand.name, input.title, input.eyebrow, "", input.greeting, ...(input.paragraphs ?? []),
    ...(input.code ? ["", `${input.code.label}: ${input.code.value}`, input.code.note] : []),
    ...facts.map(fact => `${fact.label}: ${fact.value}`),
    actionUrl && input.action ? `${input.action.label}: ${actionUrl}` : "",
    ...(input.summary ? ["", "Resumo do pedido", ...input.summary.items.map(item => `${item.name}${item.artworkName ? ` · Arte: ${item.artworkName}` : ""}: ${item.quantity} un. × ${money(item.unitCents)} = ${money(item.totalCents)}`), `Produtos: ${money(input.summary.subtotalCents + (input.summary.artworkDiscountCents ?? 0))}`, ...((input.summary.artworkDiscountCents ?? 0) > 0 ? [`Desconto por arte pronta: −${money(input.summary.artworkDiscountCents!)}`] : []), `Entrega: ${money(input.summary.shippingCents)}`, `Total do pedido: ${money(input.summary.totalCents)}`] : []),
    ...(input.sections ?? []).flatMap(section => ["", section.title, ...section.lines]),
    ...(input.tracking ?? []).flatMap(tracking => [tracking.code ? `Código de rastreio: ${tracking.code}` : "", emailHttpsUrl(tracking.url) ? `Rastrear entrega: ${emailHttpsUrl(tracking.url)}` : ""]),
    input.notice,
    ...(input.secondaryLinks ?? []).filter(link => emailHttpsUrl(link.url)).map(link => `${link.label}: ${emailHttpsUrl(link.url)}`),
    ...(input.legalText ? ["", "Cópia do documento aceito:", input.legalText] : []),
    "", contact ? `Atendimento: ${contact}` : "", brand.contactPhone, brandUrl ? `Loja: ${brandUrl}` : "", footerNote,
  ].filter(value => value !== undefined && value !== null && value !== "").join("\n");
  return { html, text };
}
