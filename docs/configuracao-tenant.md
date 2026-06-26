# Configuracao por Tenant

As configuracoes abaixo nao devem ficar no `.env`, porque variam por tenant:

- `COMPANY_NAME`
- `COMPANY_PHONE`
- `COMPANY_SITE`
- `COMPANY_LOGO_URL`
- `CORREIOS_API_TOKEN`
- `CONTRATO_CORREIOS`
- `OLIST_API_BASE_URL`
- `OLIST_CLIENT_ID`
- `OLIST_CLIENT_SECRET`
- `CRM_API_BASE_URL`
- `CRM_API_TOKEN`

## Onde cada dado fica

Dados de identidade da empresa ficam em `tenants`:

- `tenants.name`
- `tenants.company_phone`
- `tenants.company_site`
- `tenants.logo_url`

Dados de integracao ficam em `integration_connections`, sempre por `tenant_id`.

Configuracoes nao secretas ficam em `integration_connections.settings`.

Exemplos:

- URL base da API;
- numero de contrato dos Correios;
- codigos de servico;
- flags de recurso.

Credenciais secretas ficam em `integration_connections.credentials_encrypted`.

Exemplos:

- token dos Correios;
- client secret do Olist;
- token do CRM.

## Variaveis globais que permanecem no `.env`

Somente configuracoes da aplicacao:

- `APP_URL`
- `COOKIE_NAME`
- `AUTH_SECRET`
- `APP_ENCRYPTION_KEY`
- `DATABASE_URL`

`APP_ENCRYPTION_KEY` e global porque protege/desprotege os segredos armazenados por tenant no banco. Ela deve ser forte, privada e diferente por ambiente.

## Migration

Rode:

```sql
supabase/migrations/0004_tenant_profile_integrations.sql
```

Essa migration:

- adiciona `company_phone` e `company_site` em `tenants`;
- documenta colunas relacionadas a identidade da empresa;
- cria registros iniciais em `integration_connections` para `correios`, `olist` e `crm` no tenant `ground-shop`.

