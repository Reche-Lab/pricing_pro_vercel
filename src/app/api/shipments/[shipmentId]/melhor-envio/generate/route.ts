import { generateMelhorEnvioLabels } from "@/services/melhor-envio/melhor-envio";
import { performShipmentMelhorEnvioOperation } from "../_shared/perform";

export async function POST(request: Request, context: { params: Promise<{ shipmentId: string }> }) {
  return performShipmentMelhorEnvioOperation(
    request,
    context,
    "shipment.labels.generate",
    "label_generated",
    generateMelhorEnvioLabels
  );
}
