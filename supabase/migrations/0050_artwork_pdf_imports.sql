alter table public.quote_item_artworks
  drop constraint if exists quote_item_artworks_source_kind_check;

alter table public.quote_item_artworks
  add constraint quote_item_artworks_source_kind_check
    check (source_kind in ('upload', 'openrouter', 'retouch', 'pdf_page'));

create table if not exists public.artwork_pdf_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  quote_item_id uuid not null references public.quote_items(id) on delete cascade,
  original_file_name text not null,
  page_count integer not null check (page_count between 1 and 100),
  file_size integer not null check (file_size > 0 and file_size <= 4194304),
  storage_path text not null,
  created_by uuid references public.app_users(id),
  public_upload boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.quote_item_artworks
  add column if not exists source_pdf_import_id uuid references public.artwork_pdf_imports(id) on delete set null,
  add column if not exists source_pdf_page integer check (source_pdf_page is null or source_pdf_page > 0);

create unique index if not exists idx_quote_item_artworks_pdf_page
  on public.quote_item_artworks (source_pdf_import_id, source_pdf_page)
  where source_pdf_import_id is not null and source_pdf_page is not null;

create index if not exists idx_artwork_pdf_imports_quote_item
  on public.artwork_pdf_imports (tenant_id, quote_id, quote_item_id, created_at desc);

alter table public.artwork_pdf_imports enable row level security;

drop policy if exists artwork_pdf_imports_tenant_all on public.artwork_pdf_imports;
create policy artwork_pdf_imports_tenant_all on public.artwork_pdf_imports
  for all using (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id))
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id));
