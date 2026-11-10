-- Optional, tenant-owned campaign/artwork library. No content is published here.
alter table commerce_stores add column if not exists art_library_enabled boolean not null default false;
create table commerce_art_categories (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  parent_id uuid, name text not null check(length(name) between 2 and 80), slug text not null,
  active boolean not null default true, sort_order integer not null default 0,
  revision integer not null default 1, unique(tenant_id,id), unique(tenant_id,slug),
  check(parent_id is null or parent_id<>id),
  foreign key(tenant_id,parent_id) references commerce_art_categories(tenant_id,id)
);
create table commerce_art_campaigns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  name text not null, slug text not null, description text not null default '', cover_url text not null default '',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  featured boolean not null default false, starts_at timestamptz, ends_at timestamptz,
  sort_order integer not null default 0, revision integer not null default 1,
  unique(tenant_id,id), unique(tenant_id,slug), check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table commerce_library_artworks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  category_id uuid, title text not null, description text not null default '', tags text[] not null default '{}',
  search_text text not null, status text not null default 'draft' check(status in ('draft','published','archived')),
  storage_path text not null, thumbnail_path text not null, file_name text not null,
  width integer not null check(width>0), height integer not null check(height>0), content_hash text not null,
  version uuid not null default gen_random_uuid(), editable boolean not null default true,
  license_note text not null, sort_order integer not null default 0, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,id), foreign key(tenant_id,category_id) references commerce_art_categories(tenant_id,id)
);
create table commerce_library_campaign_artworks (
  tenant_id uuid not null, campaign_id uuid not null, artwork_id uuid not null,
  primary key(tenant_id,campaign_id,artwork_id),
  foreign key(tenant_id,campaign_id) references commerce_art_campaigns(tenant_id,id) on delete cascade,
  foreign key(tenant_id,artwork_id) references commerce_library_artworks(tenant_id,id) on delete cascade
);
create table commerce_library_products (
  tenant_id uuid not null, artwork_id uuid not null, product_id uuid not null,
  initial_crop jsonb, primary key(tenant_id,artwork_id,product_id),
  foreign key(tenant_id,artwork_id) references commerce_library_artworks(tenant_id,id) on delete cascade,
  foreign key(tenant_id,product_id) references commerce_products(tenant_id,id)
);
alter table commerce_artworks
  add column library_artwork_id uuid,
  add column library_version uuid,
  add column initial_crop jsonb,
  add column editing_allowed boolean not null default true,
  add constraint commerce_artworks_library_tenant_fk foreign key(tenant_id,library_artwork_id) references commerce_library_artworks(tenant_id,id);
create index commerce_library_visible on commerce_library_artworks(tenant_id,status,category_id,sort_order,id);
create index commerce_library_product_lookup on commerce_library_products(tenant_id,product_id,artwork_id);
create index commerce_library_campaign_visible on commerce_art_campaigns(tenant_id,status,featured,sort_order);
do $$ declare tab text; begin
  foreach tab in array array['commerce_art_categories','commerce_art_campaigns','commerce_library_artworks','commerce_library_campaign_artworks','commerce_library_products'] loop
    execute format('alter table %I enable row level security',tab);
    execute format('revoke all on %I from public, anon, authenticated',tab);
    execute format('create policy library_tenant_admin on %I for all using (tenant_id=current_tenant_id() and current_user_has_permission(''settings:manage'')) with check (tenant_id=current_tenant_id() and current_user_has_permission(''settings:manage''))',tab);
  end loop;
end $$;
