import { randomUUID } from "node:crypto";
import type { PaymentConnectionCheck, PaymentConnectionDiagnosis, PaymentEnvironment } from "@/domain/commerce/payment-settings";
import { paymentCredentials } from "./payments";
import { readPaymentProviderResponse } from "./payment-diagnostics";

export async function diagnosePaymentConnection(tenantId: string, environment: PaymentEnvironment): Promise<PaymentConnectionDiagnosis> {
  const credentials = await paymentCredentials(tenantId, environment);
  const end = new Date();
  const filters = new URLSearchParams({
    begin_date: new Date(end.getTime() - 86400000).toISOString(),
    end_date: end.toISOString(),
    external_reference: `diagnostic-${randomUUID()}`,
    type: "online", page: "1", page_size: "1",
  });
  const checks: PaymentConnectionCheck[] = [];
  // Restrict this diagnostic to reads and an unused reference: no preference,
  // order, charge or cancellation is created, and transaction bodies stay private.
  for (const operation of [
    { key: "identity" as const, endpoint: "/users/me", path: "/users/me" },
    { key: "orders_read" as const, endpoint: "/v1/orders", path: `/v1/orders?${filters}` },
  ]) {
    const started = Date.now();
    try {
      const response = await fetch(`https://api.mercadopago.com${operation.path}`, {
        method: "GET", headers: { authorization: `Bearer ${credentials.accessToken}` },
        cache: "no-store", signal: AbortSignal.timeout(7000), redirect: "error",
      });
      const { data, diagnostics } = await readPaymentProviderResponse(response, [credentials.accessToken, credentials.webhookSecret]);
      const check: PaymentConnectionCheck = {
        key: operation.key, endpoint: operation.endpoint, httpStatus: response.status,
        outcome: response.ok ? "ok" : "failed", code: diagnostics.codes[0],
        supportReference: diagnostics.providerRequestId,
        message: response.status === 403 ? "O Mercado Pago recusou esta consulta. A referência permite ao suporte analisar as políticas ou permissões desta operação." : response.status === 401 ? "Esta consulta não autenticou com a credencial salva. Confira a aplicação e o ambiente." : "O Mercado Pago não concluiu esta consulta. Isso não autoriza nem inicia um pagamento.",
      };
      if (response.ok) {
        if (operation.key === "identity") {
          const id = typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : "";
          if (!/^\d+$/.test(id)) {
            check.outcome = "unavailable";
            check.message = "A consulta respondeu, mas não foi possível reconhecer a identidade do vendedor.";
          } else if (id !== credentials.sellerId) {
            check.outcome = "failed"; check.code = "seller_mismatch";
            check.message = "A conta do token é diferente do vendedor salvo. Revise as credenciais e o User ID desse ambiente.";
          } else check.message = "O token consultou a conta e o vendedor corresponde ao cadastro. Isso não comprova permissão para criar pagamentos.";
        } else if (!Array.isArray(data?.data)) {
          check.outcome = "unavailable";
          check.message = "A consulta respondeu, mas o formato da resposta da Orders API não foi reconhecido.";
        } else check.message = "Consulta à Orders API autorizada. Isso não confirma autorização para criar ou processar pagamentos.";
      }
      checks.push(check);
      const context = { tenantId, environment, operation: operation.key, endpoint: operation.endpoint, httpStatus: response.status, outcome: check.outcome, durationMs: Date.now() - started, code: check.code, providerRequestId: check.supportReference };
      if (check.outcome === "ok") console.info("Commerce payment connection checked.", context);
      else console.error("Commerce payment connection check failed.", context);
    } catch (error) {
      checks.push({ key: operation.key, endpoint: operation.endpoint, outcome: "unavailable", httpStatus: null, message: "Não foi possível concluir a consulta de conexão. Aguarde e tente o diagnóstico novamente; nenhum pagamento foi iniciado." });
      console.error("Commerce payment connection check unavailable.", { tenantId, environment, operation: operation.key, errorType: error instanceof Error ? error.name : "unknown", durationMs: Date.now() - started });
    }
  }
  return { environment, checks };
}
