export const PRICING_PRO_PRODUCT_CODE = "pricing_pro";
export const ACTIVE_LEGAL_TERM_VERSION = "2026-08-16";

export function renderLegalTermHtml(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = escapeHtml(block.trim()).replaceAll("\n", "<br>");
      const highlighted = escaped.replace(/^(\d+\.\s[^<]+)(<br>|$)/, "<strong>$1</strong>$2");
      return `<p>${highlighted}</p>`;
    })
    .filter((block) => block !== "<p></p>")
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
