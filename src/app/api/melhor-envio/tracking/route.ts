import { trackMelhorEnvioShipments } from "@/services/melhor-envio/melhor-envio";
import { performMelhorEnvioOperation } from "../_shared/perform";

export async function POST(request: Request) {
  return performMelhorEnvioOperation(request, "shipment.tracking", trackMelhorEnvioShipments);
}
