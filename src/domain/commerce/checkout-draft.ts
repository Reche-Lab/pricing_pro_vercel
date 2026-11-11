import { z } from "zod";

const text = z.string().max(254);
export const contactDraftSchema = z.object({
  name: text, email: text, phone: text, document: text, postalCode: text,
  street: text, number: text, complement: text, district: text, city: text, state: text, attention: text,
}).strict();
export const checkoutDraftSchema = z.object({
  billing: contactDraftSchema, address: contactDraftSchema,
  same: z.boolean(), delivery: z.enum(["pickup", "delivery"]),
}).strict();
export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;
export type ContactDraft = CheckoutDraft["billing"];
export const emptyContact = (): ContactDraft => ({ name: "", email: "", phone: "", document: "", postalCode: "", street: "", number: "", complement: "", district: "", city: "", state: "", attention: "" });
