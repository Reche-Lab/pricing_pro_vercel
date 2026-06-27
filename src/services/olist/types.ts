export type OlistSettings = {
  api_base_url?: string;
  customer_path?: string;
  quote_path?: string;
  auth_scheme?: "Bearer" | "Token" | "ApiKey";
  auth_header?: string;
};

export type OlistCredentials = {
  apiToken?: string;
};

export type OlistRequestOptions = {
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
  body: unknown;
  method?: "POST" | "PUT" | "PATCH";
};
