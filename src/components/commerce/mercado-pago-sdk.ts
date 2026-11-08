import type { CommercePaymentSettings } from "@/domain/commerce/payment-settings";
import type { BuyerPaymentState } from "@/domain/commerce/transparent-payment";

export type CardSubmission = {
  token: string; payment_method_id: string; installments: number;
  payer?: { identification?: { type: "CPF" | "CNPJ"; number: string } };
};
type BrickController = { unmount: () => void | Promise<void> };
type BrickSettings = {
  initialization: { amount: number; payer?: BuyerPaymentState["payer"] };
  customization: { visual: { style: { theme: string } }; paymentMethods: { types: { excluded: string[] }; minInstallments: number; maxInstallments: number } };
  callbacks: {
    onReady: () => void; onError: () => void;
    onSubmit: (data: CardSubmission, additional: { paymentTypeId: "credit_card" | "debit_card" }) => Promise<void>;
  };
};
type MercadoPagoConstructor = new (key: string, options: { locale: string }) => {
  bricks: () => { create: (type: "cardPayment", id: string, settings: BrickSettings) => Promise<BrickController> };
};
declare global { interface Window { MercadoPago?: MercadoPagoConstructor } }
let loading: Promise<MercadoPagoConstructor> | undefined;
export function loadMercadoPago() {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  if (!loading) loading = new Promise<MercadoPagoConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 20000);
    const fail = () => { window.clearTimeout(timer); script.remove(); loading = undefined; reject(new Error("O formulário seguro não carregou. Tente novamente ou escolha Pix.")); };
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => { window.clearTimeout(timer); if (window.MercadoPago) resolve(window.MercadoPago); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
export function cardBrickMethods(settings: CommercePaymentSettings) {
  return {
    types: { excluded: ["prepaid_card", ...(!settings.credit ? ["credit_card"] : []), ...(!settings.debit ? ["debit_card"] : [])] },
    minInstallments: 1, maxInstallments: settings.credit ? settings.maxInstallments : 1,
  };
}
