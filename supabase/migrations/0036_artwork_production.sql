alter table public.product_variants
  add column if not exists print_diameter_mm numeric(8,2)
    check (print_diameter_mm is null or print_diameter_mm > 0);

update public.product_variants
set print_diameter_mm = greatest(coalesce(width_cm, 0), coalesce(length_cm, 0)) * 10
where print_diameter_mm is null
  and greatest(coalesce(width_cm, 0), coalesce(length_cm, 0)) > 0;

alter table public.quote_item_artworks
  add column if not exists original_width_px integer,
  add column if not exists original_height_px integer,
  add column if not exists target_diameter_mm numeric(8,2),
  add column if not exists bleed_mm numeric(6,2),
  add column if not exists safe_margin_mm numeric(6,2),
  add column if not exists dpi integer,
  add column if not exists prepared_data_url text,
  add column if not exists prepared_file_name text,
  add column if not exists prepared_width_px integer,
  add column if not exists prepared_height_px integer,
  add column if not exists quality_status text not null default 'pending'
    check (quality_status in ('pending', 'warning', 'ready')),
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists preparation_notes text,
  add column if not exists source_kind text not null default 'upload'
    check (source_kind in ('upload', 'openrouter')),
  add column if not exists ai_prompt text,
  add column if not exists approved_by uuid references public.app_users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists prepared_at timestamptz,
  add column if not exists version integer not null default 1;

create table if not exists public.artwork_production_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  page_width_mm numeric(8,2) not null default 210,
  page_height_mm numeric(8,2) not null default 297,
  margin_mm numeric(6,2) not null default 7,
  bleed_mm numeric(6,2) not null default 2,
  safe_margin_mm numeric(6,2) not null default 2,
  gap_mm numeric(6,2) not null default 2,
  dpi integer not null default 300,
  layout_mode text not null default 'auto'
    check (layout_mode in ('auto', 'grid', 'hex')),
  draw_cut_lines boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (page_width_mm > 0 and page_height_mm > 0),
  check (margin_mm >= 0 and bleed_mm >= 0 and safe_margin_mm >= 0 and gap_mm >= 0),
  check (dpi between 150 and 1200)
);

alter table public.artwork_production_profiles enable row level security;

drop policy if exists artwork_production_profiles_tenant_all on public.artwork_production_profiles;
create policy artwork_production_profiles_tenant_all on public.artwork_production_profiles
  for all using (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id))
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id));

create index if not exists idx_quote_item_artworks_production
  on public.quote_item_artworks (tenant_id, quote_id, approval_status, created_at);
