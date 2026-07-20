export type OlistSettings = {
  api_base_url?: string;
  app_base_url?: string;
  authorize_path?: string;
  token_path?: string;
  customer_path?: string;
  customer_lookup_path?: string;
  quote_path?: string;
  sales_order_path?: string;
  sales_order_items_path?: string;
  sales_order_dispatch_path?: string;
  invoice_path?: string;
  invoice_emit_path?: string;
  invoice_cancel_path?: string;
  user_path?: string;
  task_path?: string;
  scopes?: string[];
  api_version?: "v3";
  auth_scheme?: "Bearer" | "Token" | "ApiKey";
  auth_header?: string;
  default_payment_category_external_id?: string;
  default_payment_category_name?: string;
  default_frete_por_conta?: "R" | "D" | "T" | "3" | "4" | "S";
  melhor_envio_forma_envio_id?: string;
  melhor_envio_forma_envio_name?: string;
  correios_forma_envio_id?: string;
  correios_forma_envio_name?: string;
  pickup_forma_envio_id?: string;
  pickup_forma_envio_name?: string;
  carrier_forma_envio_id?: string;
  carrier_forma_envio_name?: string;
  sedex_forma_frete_id?: string;
  sedex_forma_frete_name?: string;
  pac_forma_frete_id?: string;
  pac_forma_frete_name?: string;
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
