type JsonObject = Record<string, unknown>;
type PaymentDiagnostics = {
  codes: string[];
  messages: string[];
  bodyKind: "json" | "empty" | "html" | "text" | "invalid_json" | "truncated";
  providerRequestId?: string;
};
const asObject = (value: unknown): JsonObject | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const safeCode = (value: unknown, secrets: string[]) => {
  const code = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : "";
  if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(code) || secrets.some(secret => secret.length >= 3 && code.includes(secret))) return undefined;
  return code;
};

function redactMessage(value: string, secrets: string[]) {
  let text = value;
  for (const secret of [...secrets].filter(secret => secret.length >= 3).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, "[redacted]");
  return text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
    .replace(/Bearer\s+[a-zA-Z0-9_.~-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:APP_USR|TEST)-[a-zA-Z0-9-]+\b/g, "[credential]")
    .replace(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/\b[a-fA-F0-9]{24,}\b/g, "[token]")
    .replace(/\b(?:\d[\s()./-]*){8,}\d\b/g, "[number]")
    .trim().slice(0, 280);
}

export async function readPaymentProviderResponse(response: Response, secrets: string[] = []) {
  const diagnostics: PaymentDiagnostics = { codes: [], messages: [], bodyKind: "empty" };
  diagnostics.providerRequestId = safeCode(response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id"), secrets);
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // A success may contain a large Pix QR image. Never log that body or a raw
  // error body: only known diagnostic fields, with bounded size and redaction.
  if (reader) {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel(); diagnostics.bodyKind = "truncated";
        return { data: null, diagnostics };
      }
      chunks.push(part.value);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return { data: null, diagnostics };
  let parsed: unknown;
  try { parsed = JSON.parse(text); diagnostics.bodyKind = "json"; }
  catch {
    diagnostics.bodyKind = /^\s*</.test(text) ? "html" : response.headers.get("content-type")?.includes("json") ? "invalid_json" : "text";
    return { data: null, diagnostics };
  }
  if (!response.ok) {
    const visit = (value: unknown, depth: number) => {
      if (depth > 4) return;
      if (Array.isArray(value)) { value.slice(0, 4).forEach(item => visit(item, depth + 1)); return; }
      const item = asObject(value);
      if (!item) return;
      for (const key of ["code", "error"] as const) {
        const code = safeCode(item[key], secrets);
        if (code && diagnostics.codes.length < 8 && !diagnostics.codes.includes(code)) diagnostics.codes.push(code);
      }
      for (const key of ["message", "description", "error_description"] as const) {
        if (typeof item[key] !== "string") continue;
        const message = redactMessage(item[key], secrets);
        if (message && diagnostics.messages.length < 5 && !diagnostics.messages.includes(message)) diagnostics.messages.push(message);
      }
      for (const key of ["error", "errors", "cause", "details"] as const) visit(item[key], depth + 1);
    };
    visit(parsed, 0);
  }
  return { data: asObject(parsed), diagnostics };
}

export function paymentFailureMessage(status: number) {
  if (status === 403) return "O Mercado Pago não autorizou a criação do pagamento. A loja precisa revisar a habilitação do recebimento online. Entre em contato com a loja ou escolha outra opção de pagamento.";
  if (status === 401) return "Não foi possível autenticar a conexão de pagamento da loja com o Mercado Pago. Entre em contato com a loja ou escolha outra opção de pagamento.";
  if ([400, 404, 422].includes(status)) return "O pagamento não foi iniciado. Confira os dados ou entre em contato com a loja.";
  return "Estamos verificando o pagamento. Não realize outra cobrança. Atualize a situação em instantes ou entre em contato com a loja.";
}
