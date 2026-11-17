import { z } from "zod";

function validGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value)) return false;
  const digits = [...value].map(Number), check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}
export const commerceMerchantSchema = z.object({
  enabled: z.boolean(),
  identifiersAbsent: z.boolean(),
  brand: z.string().trim().max(70).default(""),
  gtin: z.string().trim().max(14).refine(value => !value || validGtin(value), "Informe um GTIN válido, sem pontuação.").default(""),
  mpn: z.string().trim().max(70).default(""),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.identifiersAbsent && !value.gtin && !(value.brand && value.mpn)) ctx.addIssue({ code: "custom", message: "Informe GTIN ou marca e MPN, ou confirme que o produto não possui identificadores atribuídos.", path: ["identifiersAbsent"] });
  if (value.identifiersAbsent && (value.gtin || value.mpn)) ctx.addIssue({ code: "custom", message: "Um produto com GTIN ou MPN não pode ser declarado sem identificadores.", path: ["identifiersAbsent"] });
});
export type CommerceMerchant = z.infer<typeof commerceMerchantSchema>;
export const emptyCommerceMerchant = (): CommerceMerchant => ({ enabled: false, identifiersAbsent: false, brand: "", gtin: "", mpn: "" });
