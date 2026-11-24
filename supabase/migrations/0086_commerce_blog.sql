-- Blog content is served through tenant-scoped application handlers, never direct public SQL.
create table if not exists commerce_blog_settings (
  tenant_id uuid primary key references commerce_stores(tenant_id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now()
);

create table if not exists commerce_blog_posts (
  tenant_id uuid not null references commerce_stores(tenant_id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  revision integer not null default 1 check (revision > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users(id),
  primary key (tenant_id, slug)
);
create index if not exists idx_commerce_blog_posts_public on commerce_blog_posts (tenant_id, status, published_at desc);

alter table commerce_blog_settings enable row level security;
alter table commerce_blog_posts enable row level security;
revoke all on commerce_blog_settings, commerce_blog_posts from public, anon, authenticated;
