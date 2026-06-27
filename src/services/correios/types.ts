import type { SelectedPackage } from "@/domain/shipping/types";

export type CorreiosSettings = {
  api_base_url?: string;
  contrato_correios?: string;
  servicos?: {
    sedex?: string;
    pac?: string;
  };
};

export type CorreiosCredentials = {
  token: string;
};

export type CorreiosQuoteInput = {
  service: "sedex" | "pac";
  originPostalCode: string;
  destinationPostalCode: string;
  packaging: SelectedPackage;
  declaredValue?: number;
};

export type CorreiosPayloadItem = {
  coProduto: string;
  nuRequisicao: string;
  nuContrato: string;
  nuDR: number;
  cepOrigem: string;
  cepDestino: string;
  psObjeto: string;
  comprimento: string;
  largura: string;
  altura: string;
  diametro: string;
  servicosAdicionais: unknown[];
  criterios: unknown[];
  vlDeclarado: string;
};

export type CorreiosPayload = {
  idLote: string;
  parametrosProduto: CorreiosPayloadItem[];
};

export type CorreiosQuoteResult = {
  totalFrete: number;
  raw: unknown;
};
