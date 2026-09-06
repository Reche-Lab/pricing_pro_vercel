import { z } from "zod";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";

export const cartLineSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50000),
    artworkName: z.string().trim().max(100),
    artworkId: z.string().uuid().nullable(),
  })
  .strict();
export const cartSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    lines: z.array(cartLineSchema).max(40),
  })
  .strict();
export const safeImageUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use uma URL HTTPS para a imagem.");
export const storeSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500),
    logoUrl: safeImageUrl,
    bannerUrl: safeImageUrl,
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
    active: z.boolean(),
    minQuantity: z.number().int().min(1).max(50000),
    maxQuantity: z.number().int().min(1).max(50000),
    maxArtworks: z.number().int().min(1).max(20),
    personalized: z.boolean(),
    pricingRule: z.enum(["per_art", "total", "average"]),
  })
  .strict()
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
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .min(10)
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
    postalCode: z.string().regex(/^\d{8}$/),
    street: z.string().trim().min(2).max(150),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(100),
    district: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
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
    ]),
    attention: z.string().trim().max(100),
  })
  .strict();
export const checkoutSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    expectedTotalCents: z.number().int().positive(),
    delivery: z.enum(["pickup", "delivery"]),
    address: addressSchema.nullable(),
    provider: z.enum(["manual", "mercado_pago"]),
    acceptedTerms: z.literal(true),
  })
  .strict();
export type CartLine = z.infer<typeof cartLineSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type StoreAdminInput = z.infer<typeof storeAdminSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
