create table if not exists quote_item_artworks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  quote_item_id uuid not null references quote_items(id) on delete cascade,
  artwork_name text,
  file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  data_url text not null,
  storage_path text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_item_artworks_quote
  on quote_item_artworks (tenant_id, quote_id, created_at);

create index if not exists idx_quote_item_artworks_item
  on quote_item_artworks (tenant_id, quote_item_id, created_at);

alter table quote_item_artworks enable row level security;

drop policy if exists quote_item_artworks_tenant_all on quote_item_artworks;
create policy quote_item_artworks_tenant_all on quote_item_artworks
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));
