alter table tenants
  add column if not exists company_phone text,
  add column if not exists company_site text;

comment on column tenants.name is 'Tenant/company display name. Tenant-specific; do not keep this in app env.';
comment on column tenants.logo_url is 'Tenant/company logo URL. Tenant-specific; do not keep this in app env.';
comment on column tenants.company_phone is 'Tenant/company phone. Tenant-specific; do not keep this in app env.';
comment on column tenants.company_site is 'Tenant/company website. Tenant-specific; do not keep this in app env.';
comment on table integration_connections is 'Tenant-specific integration settings and encrypted credentials.';
comment on column integration_connections.credentials_encrypted is 'Encrypted provider credentials. Decrypt only in trusted backend code.';
comment on column integration_connections.settings is 'Non-secret provider settings such as API base URL, contract number or feature flags.';

update tenants
set
  company_phone = coalesce(company_phone, ''),
  company_site = coalesce(company_site, ''),
  updated_at = now()
where slug = 'ground-shop';

insert into integration_connections (tenant_id, provider, status, settings, credentials_encrypted)
select
  id,
  'correios',
  'disabled',
  jsonb_build_object(
    'api_base_url', 'https://api.correios.com.br',
    'contrato_correios', '',
    'servicos', jsonb_build_object(
      'sedex', '04162',
      'pac', '04669'
    )
  ),
  null
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, provider) do update
set
  settings = integration_connections.settings || excluded.settings,
  updated_at = now();

insert into integration_connections (tenant_id, provider, status, settings, credentials_encrypted)
select
  id,
  'olist',
  'disabled',
  jsonb_build_object(
    'api_base_url', '',
    'scopes', jsonb_build_array('customers', 'quotes')
  ),
  null
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, provider) do update
set
  settings = integration_connections.settings || excluded.settings,
  updated_at = now();

insert into integration_connections (tenant_id, provider, status, settings, credentials_encrypted)
select
  id,
  'crm',
  'disabled',
  jsonb_build_object(
    'api_base_url', '',
    'provider', 'olist_crm'
  ),
  null
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, provider) do update
set
  settings = integration_connections.settings || excluded.settings,
  updated_at = now();
