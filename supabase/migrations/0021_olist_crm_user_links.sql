alter table tenant_members
  add column if not exists external_olist_user_id text,
  add column if not exists olist_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_tenant_members_external_olist_user
  on tenant_members (tenant_id, external_olist_user_id)
  where external_olist_user_id is not null;
