import { z } from "zod";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";
import { productMediaSchema, safeCommerceMediaUrl } from "./product-media";
import { commerceArtworkOptionsSchema } from "./artwork-options";

export const cartLineSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50000),
    artworkName: z.string().trim().max(100),
    artworkId: z.string().uuid().nullable(),
    preparation: z.enum(["customer", "team"]).optional(),
  })
  .strict();
export const cartSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    lines: z.array(cartLineSchema).max(40),
  })
  .strict();
export const safeImageUrl = safeCommerceMediaUrl;
export const storeSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500),
    logoUrl: safeImageUrl,
    bannerUrl: safeImageUrl,
    theme: z.enum(["light", "dark", "system"]).optional(),
    banners: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            imageUrl: safeImageUrl.refine(Boolean, "Envie a imagem do banner."),
            mobileImageUrl: safeImageUrl.optional(),
            showText: z.boolean().optional(),
            title: z.string().trim().max(100),
            description: z.string().trim().max(200),
            buttonLabel: z.string().trim().max(40),
            category: z.string().trim().max(100),
          })
          .strict(),
      )
      .max(5)
      .optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    contactEmail: z.string().email(),
    contactPhone: z.string().trim().max(30),
    pickupEnabled: z.boolean(),
    pickupAddress: z.string().trim().max(300),
    deliveryEnabled: z.boolean(),
    deliveryCents: z.number().int().min(0).max(1000000),
    deliveryDescription: z.string().trim().max(200),
    terms: z.string().trim().max(10000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.pickupEnabled && !value.pickupAddress)
      ctx.addIssue({
        code: "custom",
        path: ["pickupAddress"],
        message: "Informe o endereço de retirada.",
      });
    if (value.deliveryEnabled && !value.deliveryDescription)
      ctx.addIssue({
        code: "custom",
        path: ["deliveryDescription"],
        message: "Descreva a área e o prazo da entrega.",
      });
  });
export const publicationSchema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string().trim().min(2).max(140),
    description: z.string().trim().max(4000),
    category: z.string().trim().min(1).max(100),
    imageUrl: safeImageUrl.refine(Boolean, "Inclua a imagem do produto."),
    media: productMediaSchema.optional(),
    active: z.boolean(),
    minQuantity: z.number().int().min(1).max(50000),
    maxQuantity: z.number().int().min(1).max(50000),
    maxArtworks: z.number().int().min(1).max(20),
    personalized: z.boolean(),
    artworkOptions: commerceArtworkOptionsSchema.optional(),
    pricingRule: z.enum(["per_art", "total", "average"]),
  })
  .strict()
  .refine(
    (value) => !value.media || value.media[0]?.url === value.imageUrl,
    "A capa deve ser a primeira imagem da galeria.",
  )
  .refine(
    (value) => value.maxQuantity >= value.minQuantity,
    "Quantidade máxima menor que a mínima.",
  );
export const storeAdminSchema = z
  .object({
    enabled: z.boolean(),
    status: z.enum(["draft", "published", "paused"]),
    platformId: z.string().uuid(),
    settings: storeSettingsSchema,
    products: z.array(publicationSchema).max(200),
  })
  .strict();
export const addressSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do destinatário.").max(100),
    phone: z
      .string()
      .trim()
      .min(10, "Informe um telefone válido com DDD.")
      .max(25)
      .refine(
        (v) => /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10,
        "Informe um telefone válido com DDD.",
      ),
    document: z
      .string()
      .trim()
      .max(20)
      .refine((v) => !v || isValidCpfOrCnpj(v), "CPF/CNPJ inválido."),
    postalCode: z.string().regex(/^\d{8}$/, "Informe um CEP com 8 dígitos."),
    street: z.string().trim().min(2, "Informe o endereço.").max(150),
    number: z.string().trim().min(1, "Informe o número ou S/N.").max(20),
    complement: z.string().trim().max(100),
    district: z.string().trim().min(2, "Informe o bairro.").max(100),
    city: z.string().trim().min(2, "Informe a cidade.").max(100),
    state: z.enum([
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ], { errorMap: () => ({ message: "Selecione uma UF válida." }) }),
    attention: z.string().trim().max(100),
  })
  .strict();
export const checkoutSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    expectedTotalCents: z.number().int().positive(),
    delivery: z.enum(["pickup", "delivery"]),
    address: addressSchema.nullable(),
    billing: addressSchema.omit({ attention: true }).extend({
      name: z.string().trim().min(2, "Informe o nome completo ou a razão social.").max(100),
      email: z.string().trim().max(254).email("Informe um e-mail válido para faturamento."),
      document: z.string().trim().min(1, "Informe o CPF ou CNPJ para faturamento.").max(20)
        .refine(value => /\d/.test(value) && isValidCpfOrCnpj(value), "Informe um CPF ou CNPJ válido para faturamento.")
        .transform(value => value.replace(/\D/g, "")),
    }).strict(),
    deliveryAddressSameAsBilling: z.boolean(),
    provider: z.enum(["manual", "mercado_pago"]),
    acceptedTerms: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.delivery === "delivery" && !value.deliveryAddressSameAsBilling && !value.address)
      ctx.addIssue({ code: "custom", path: ["address"], message: "Informe os dados do destinatário e o endereço de entrega." });
  });
export type CartLine = z.infer<typeof cartLineSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type StoreAdminInput = z.infer<typeof storeAdminSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CommerceAddress = z.infer<typeof addressSchema>;
export type CommerceBilling = CheckoutInput["billing"];
export type CommerceBillingSnapshot = CommerceBilling & { personType: "F" | "J" };
