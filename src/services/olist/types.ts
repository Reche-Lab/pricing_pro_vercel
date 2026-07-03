export type OlistSettings = {
  api_base_url?: string;
  app_base_url?: string;
  authorize_path?: string;
  token_path?: string;
  customer_path?: string;
  customer_lookup_path?: string;
  quote_path?: string;
  sales_order_path?: string;
  invoice_path?: string;
  invoice_emit_path?: string;
  invoice_cancel_path?: string;
  user_path?: string;
  task_path?: string;
  scopes?: string[];
  api_version?: "v3";
  auth_scheme?: "Bearer" | "Token" | "ApiKey";
  auth_header?: string;
};

export type OlistCredentials = {
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
};

export type OlistRequestOptions = {
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type OlistOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};
