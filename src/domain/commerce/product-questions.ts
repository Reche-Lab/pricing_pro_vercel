import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "./schemas";
import { productionDays } from "@/domain/shipping/production-lead-time";
import { publicPriceMoney, quantityPriceDescription } from "./quantity-pricing";
import { assistantArtworkBenefit } from "./assistant-guide";

export function productQuestions(product: ReturnType<typeof publicCommerceProduct>, settings: StoreSettings) {
  const pricing = product.quantityPricing, quantity = pricing?.bestPrice.quantity ?? product.minQuantity;
  const benefit = assistantArtworkBenefit(product);
  return [
    ...(pricing ? [{ question: `Quanto custa ${product.name} por quantidade?`, answer: quantityPriceDescription(product) + ` O preço varia ${pricing.mode === "step" ? "por faixas de quantidade" : "pela curva de quantidade"}; a tabela apresenta exemplos calculados para este produto.` }] : []),
    ...(product.personalized ? [{ question: "Posso enviar mais de uma arte?", answer: `Sim, até ${Math.min(10, product.maxArtworks)} artes e nunca mais artes do que unidades. ${product.pricingRule === "total" ? "A curva considera a quantidade total deste produto, somando as artes." : product.pricingRule === "average" ? "O preço considera a média de unidades por arte, arredondada para a unidade mais próxima." : "O preço considera separadamente a quantidade de cada arte; dividir o pedido entre artes pode mudar o preço unitário."} Os valores da tabela consideram uma única arte.` }] : []),
    ...(benefit ? [{ question: "Há benefício por preparar e aprovar a arte?", answer: `Sim. Após preparar, enquadrar e aprovar a arte na loja, o benefício é o menor valor entre ${publicPriceMoney(benefit.limitPerArtworkCents)} e ${benefit.percent.toLocaleString("pt-BR")}% dos produtos daquele grupo de arte. Somente enviar a imagem não libera o benefício. Ele é separado do desconto por quantidade; os percentuais não são simplesmente somados.` }] : []),
    { question: "Qual é o prazo de produção e entrega?", answer: `Para ${quantity.toLocaleString("pt-BR")} unidades deste produto, a produção estimada é de ${productionDays(quantity, settings.production)} dias úteis após a confirmação do pagamento${product.personalized ? " e a aprovação das artes" : ""}. A estimativa muda conforme a quantidade e os demais itens do pedido. O transporte é calculado separadamente pelo CEP e somado ao prazo de produção.${settings.pickupEnabled ? " Também é possível retirar na loja, conforme combinado." : ""}` },
    { question: "Posso solicitar um orçamento sem comprar agora?", answer: `Sim. Selecione os produtos e quantidades, valide seu e-mail e informe os dados de faturamento e recebimento. O orçamento em PDF fica salvo na sua conta da ${settings.name}, sem obrigação de compra.${product.personalized ? " A arte não é obrigatória para orçar." : ""} Os preços e o frete são conferidos novamente antes da compra.` },
  ];
}
