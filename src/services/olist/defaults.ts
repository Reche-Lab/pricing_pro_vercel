export const OLIST_API_V3_BASE_URL = "https://api.tiny.com.br/public-api/v3";
export const OLIST_APP_BASE_URL = "https://accounts.tiny.com.br";

export const OLIST_DEFAULT_PATHS = {
  authorize: "/realms/tiny/protocol/openid-connect/auth",
  token: "/realms/tiny/protocol/openid-connect/token",
  customer: "/contatos",
  customerLookup: "/contatos",
  salesOrder: "/pedidos",
  invoice: "/pedidos/{idPedido}/gerar-nota-fiscal",
  invoiceEmit: "/notas/{idNota}/emitir",
  crmQuote: "/crm/assuntos",
  crmTask: "/crm/assuntos/{idAssunto}/acoes",
  users: "/usuarios",
  sellers: "/vendedores"
} as const;
