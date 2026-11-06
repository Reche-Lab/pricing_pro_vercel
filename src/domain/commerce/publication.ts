import type { StoreAdminInput } from "./schemas";

export type CommerceLaunchReadiness = {
  carrierReady: boolean;
  carrierMessage: string;
  paymentReady: boolean;
  emailReady: boolean;
  httpsReady: boolean;
};

export function commercePublicationIssues(input: StoreAdminInput, readiness?: CommerceLaunchReadiness) {
  const issues: string[] = [];
  if (!input.products.some(product => product.active)) issues.push("Marque pelo menos um produto como ‘Publicar este produto’.");
  if (!input.settings.terms.trim()) issues.push("Preencha as condições de compra, produção, entrega e privacidade.");
  if (!input.settings.pickupEnabled && !input.settings.deliveryEnabled && !input.settings.carrierEnabled)
    issues.push("Habilite retirada, entrega com preço fixo ou frete Melhor Envio.");
  if (input.settings.carrierEnabled && readiness && !readiness.carrierReady) issues.push(readiness.carrierMessage);
  if (readiness && !readiness.paymentReady) issues.push("Habilite e salve uma forma de pagamento na aba Pagamentos.");
  return issues;
}
