create table if not exists commerce_domain_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references commerce_stores(tenant_id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname) and length(hostname) between 4 and 253),
  dns_provider text not null default '',
  verification_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  expected_records jsonb not null default '[]'::jsonb check (jsonb_typeof(expected_records) = 'array'),
  operator_note text not null default '',
  vercel_added_at timestamptz,
  https_confirmed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references app_users(id),
  last_check jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_commerce_domains_tenant on commerce_domain_requests(tenant_id, created_at desc);

create table if not exists commerce_email_connections (
  tenant_id uuid primary key references commerce_stores(tenant_id) on delete cascade,
  host text not null,
  port integer not null check (port in (465, 587)),
  username text not null,
  from_email text not null,
  from_name text not null,
  reply_to text not null default '',
  password_encrypted text not null,
  enabled boolean not null default false,
  revision integer not null default 1,
  tested_revision integer,
  tested_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not enabled or (tested_revision is not null and tested_revision = revision and tested_at is not null))
);

alter table commerce_domain_requests enable row level security;
alter table commerce_email_connections enable row level security;
revoke all on commerce_domain_requests, commerce_email_connections from anon, authenticated;

drop policy if exists commerce_domains_admin_read on commerce_domain_requests;
create policy commerce_domains_admin_read on commerce_domain_requests for select using (
  current_user_is_super_admin() or (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'))
);
-- All writes and SMTP secrets are accessed only through authenticated server handlers.
