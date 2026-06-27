import { printMelhorEnvioLabels } from "@/services/melhor-envio/melhor-envio";
import { performMelhorEnvioOperation } from "../_shared/perform";

export async function POST(request: Request) {
  return performMelhorEnvioOperation(request, "labels.print", printMelhorEnvioLabels);
}
