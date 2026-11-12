import { z } from "zod";
import { publicHostname } from "./domain-setup";
const headerText = z.string().trim().min(1).max(254).refine(value => !/[\r\n\x00]/.test(value), "Remova as quebras de linha.");
export const storeEmailSchema = z.object({
  host: publicHostname, port: z.union([z.literal(465), z.literal(587)]), username: headerText,
  fromEmail: z.string().trim().email().max(254), fromName: headerText,
  replyTo: z.union([z.literal(""), z.string().trim().email().max(254)]),
  password: z.string().max(1024), revision: z.number().int().nonnegative(),
}).strict();
export type StoreEmailInput = z.infer<typeof storeEmailSchema>;
export type StoreEmailSettings = Omit<StoreEmailInput, "password"> & { configured: boolean; enabled: boolean; hasPassword: boolean; testedAt: string | null; tested: boolean };
