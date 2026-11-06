import type { ProductMockup } from "./artwork-options";
import botton from "../../../public/mockups/botton-25mm-v1/modelo.json";
import ima from "../../../public/mockups/ima-redondo-v1/modelo.json";
import espelho from "../../../public/mockups/espelho-redondo-v1/modelo.json";
import abridor from "../../../public/mockups/abridor-redondo-v1/modelo.json";

export const circularMockupPresets: readonly {
  id: string;
  label: string;
  finish: string;
  model: ProductMockup;
  downloadUrl: string;
}[] = [
  { id: "botton", label: "Botton", finish: "Alfinete", model: botton, downloadUrl: "/mockups/botton-25mm-v1/kit-botton.zip" },
  { id: "ima", label: "Ímã", finish: "Disco magnético preto", model: ima, downloadUrl: "/mockups/ima-redondo-v1/kit-ima.zip" },
  { id: "espelho", label: "Espelho", finish: "Espelho circular", model: espelho, downloadUrl: "/mockups/espelho-redondo-v1/kit-espelho.zip" },
  { id: "abridor", label: "Abridor", finish: "Abridor de garrafas", model: abridor, downloadUrl: "/mockups/abridor-redondo-v1/kit-abridor.zip" },
];
