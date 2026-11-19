import { z } from "zod";
import { CommerceError } from "./commerce";

export const pendingOrderActionSchema = z.object({
  action: z.enum(["edit", "clear", "quote"]),
  revision: z.number().int().nonnegative(),
  confirm: z.literal(true),
  confirmReplace: z.boolean().optional(),
}).strict();
export type PendingOrderAction = z.infer<typeof pendingOrderActionSchema>;
export function assertPendingOrderEditable(order: { payment_status: string; fulfillment_status: string; cancelled_at?: unknown; deleted_at?: unknown }) {
  if (order.cancelled_at || order.deleted_at || order.payment_status !== "pending" || order.fulfillment_status !== "received")
    throw new CommerceError("Este pedido não pode mais ser alterado. Atualize a situação para conferir o pagamento.", 409);
}
