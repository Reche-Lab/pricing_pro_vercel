import type { SelectedPackage } from "@/domain/shipping/types";

export type MelhorEnvioSettings = {
  api_base_url?: string;
  app_base_url?: string;
  redirect_uri?: string;
  user_agent?: string;
  services?: string[];
  environment?: "sandbox" | "production";
};

export type MelhorEnvioCredentials = {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
};

export type MelhorEnvioQuoteInput = {
  serviceIds?: string[];
  originPostalCode: string;
  destinationPostalCode: string;
  declaredValue?: number;
  insuranceValue?: number;
  ownHand?: boolean;
  receipt?: boolean;
  packaging: SelectedPackage;
};

export type MelhorEnvioRequestOptions = {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
  settings: MelhorEnvioSettings;
  credentials: MelhorEnvioCredentials;
};

export type MelhorEnvioOAuthTokenResponse = {
  token_type?: string;
  expires_in?: number;
  access_token: string;
  refresh_token?: string;
  scope?: string;
};
