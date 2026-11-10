import { z } from "zod";
import { CommerceError } from "./commerce";

export const orderDeletionSchema = z
  .object({
    confirmation: z
      .string()
      .trim()
      .min(1, "Digite a confirmação do pedido.")
      .max(80),
    reason: z
      .string()
      .trim()
      .min(5, "Informe um motivo com pelo menos 5 caracteres.")
      .max(500, "O motivo deve ter até 500 caracteres."),
  })
  .strict();
export type OrderDeletionInput = z.infer<typeof orderDeletionSchema>;
export const orderDeletionConfirmation = (id: string) =>
  `EXCLUIR ${id.slice(0, 8).toUpperCase()}`;
export function assertOrderDeletionConfirmation(
  id: string,
  confirmation: string,
) {
  if (confirmation.trim().toUpperCase() !== orderDeletionConfirmation(id))
    throw new CommerceError(
      "Digite a confirmação completa correspondente a este pedido.",
    );
}
