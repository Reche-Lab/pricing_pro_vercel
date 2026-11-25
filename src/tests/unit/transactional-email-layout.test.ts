// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailHttpsUrl, renderTransactionalEmail, type TransactionalEmail } from "@/services/email/email-layout";

const base: TransactionalEmail = {
  brand: { name: "Loja & Companhia", url: "https://shop.example.com", logoUrl: "https://cdn.example.com/logo.png", contactEmail: "ajuda@example.com", contactPhone: "+55 11 99999-0000" },
  title: "Pagamento confirmado", preheader: "Seu pedido está confirmado.", greeting: "Olá, Ana.",
  action: { label: "Acompanhar pedido", url: "https://shop.example.com/pedidos/123?a=1&b=2" },
};

describe("shared transactional email presentation", () => {
  it("provides a complete accessible document and a useful text alternative", () => {
    const { html, text } = renderTransactionalEmail(base);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('name="viewport"'); expect(html).toContain('role="presentation"');
    expect(html).toContain('width="640"'); expect(html).toContain('max-width:480px');
    expect(html).toContain('alt="Loja &amp; Companhia"'); expect(html).toContain('width="48" height="48"');
    expect(html).toContain("Se o botão não abrir, copie este endereço:");
    expect(html).toContain("pedidos/123?a=1&amp;b=2");
    expect(text).toContain(base.action!.url); expect(text).toContain("Atendimento: ajuda@example.com");
    expect(text).toContain("Não compartilhe senhas ou códigos de acesso.");
    expect(html).not.toMatch(/<script|<iframe|<form|<svg|@import|<link /i);
  });

  it("keeps the access code out of the subject/title and hidden preview", () => {
    const result = renderTransactionalEmail({ ...base, code: { label: "Código de acesso", value: "753192", note: "10 minutos · uso único" } });
    expect(result.html.match(/753192/g)).toHaveLength(1);
    expect(result.html.split("</head>")[0]).not.toContain("753192");
    expect(result.html.split("<table")[0]).not.toContain("753192");
    expect(result.text).toContain("Código de acesso: 753192");
  });

  it("escapes every customer-editable field without changing the text alternative", () => {
    const attack = '<img src=x onerror="alert(1)">&';
    const { html, text } = renderTransactionalEmail({
      brand: { name: attack, contactPhone: attack }, title: attack, preheader: attack, eyebrow: attack,
      greeting: attack, paragraphs: [attack], facts: [{ label: attack, value: attack }],
      sections: [{ title: attack, lines: [attack] }], notice: attack, legalText: attack, footerNote: attack,
      code: { label: attack, value: attack, note: attack }, tracking: [{ code: attack, url: null }],
    });
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;"); expect(text).toContain(attack);
  });

  it.each(["javascript:alert(1)", "http://shop.example.com", "https://user:pass@example.com", "//example.com", "bad"])("rejects unsafe URLs: %s", value => {
    expect(emailHttpsUrl(value)).toBeNull();
    const { html, text } = renderTransactionalEmail({ ...base, brand: { name: "Loja", url: value, logoUrl: value }, action: { label: "Open", url: value }, secondaryLinks: [{ label: "More", url: value }], tracking: [{ code: "ABC123", url: value }] });
    expect(html).not.toContain('src='); expect(html).not.toContain('href='); expect(text).not.toContain(value);
    expect(text).toContain("ABC123");
  });

  it("selects a readable foreground even with a very light tenant accent", () => {
    const { html } = renderTransactionalEmail({ ...base, brand: { ...base.brand, accent: "#ffffff" } });
    expect(html).toContain("background:#ffffff;color:#000000");
    expect(html).toContain("color:#126352;text-decoration:underline");
    expect(renderTransactionalEmail({ ...base, brand: { name: "Loja", accent: 'red;position:fixed' } }).html).not.toContain("position:fixed");
  });

  it("renders frozen line values and subtracts the artwork benefit exactly once", () => {
    const { text, html } = renderTransactionalEmail({ ...base, summary: {
      code: "ABCD1234", date: "25/11/2026 10:30", items: [{ name: "Botton <3,5 cm>", quantity: 50, unitCents: 300, totalCents: 15000, artworkName: "Campanha & Evento" }],
      subtotalCents: 13500, shippingCents: 2000, totalCents: 15500, artworkDiscountCents: 1500,
    } });
    expect(text).toContain("Produtos: R$ 150,00"); expect(text).toContain("Desconto por arte pronta: −R$ 15,00");
    expect(text).toContain("Total do pedido: R$ 155,00"); expect(html).toContain("Produtos antes do benefício");
    expect(html).toContain("Botton &lt;3,5 cm&gt;"); expect(html).toContain("Campanha &amp; Evento");
    expect(text).toContain("Pedido: #ABCD1234"); expect(text).toContain("Realizado em: 25/11/2026 10:30");
  });

  it("preserves the full legal document and secondary links in both formats", () => {
    const legalText = "Primeira linha\n\nÚltima linha <literal>.";
    const { text, html } = renderTransactionalEmail({ ...base, legalText, secondaryLinks: [{ label: "Solicitação", url: "https://app.example.com/request" }] });
    expect(text).toContain(legalText); expect(text).toContain("Solicitação: https://app.example.com/request");
    expect(html).toContain("Última linha &lt;literal&gt;."); expect(html).toContain("white-space:pre-wrap");
  });

  it("encodes contact mailboxes instead of injecting mailto query parameters", () => {
    const { html } = renderTransactionalEmail({ ...base, brand: { name: "Loja", contactEmail: "support?subject=hello@example.com" } });
    expect(html).toContain('href="mailto:support%3Fsubject%3Dhello@example.com"');
  });
});
