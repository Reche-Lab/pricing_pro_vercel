import { checkoutMelhorEnvioCart } from "@/services/melhor-envio/melhor-envio";
import { performMelhorEnvioOperation } from "../_shared/perform";

export async function POST(request: Request) {
  return performMelhorEnvioOperation(request, "cart.checkout", checkoutMelhorEnvioCart);
}
