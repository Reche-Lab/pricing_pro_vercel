alter table public.quote_item_artworks
  alter column data_url drop not null;

alter table public.quote_item_artworks
  add column if not exists prepared_storage_path text,
  add column if not exists production_quantity integer
    check (production_quantity is null or production_quantity > 0),
  add column if not exists crop_scale numeric(7,4) not null default 1
    check (crop_scale between 1 and 5),
  add column if not exists crop_offset_x numeric(7,4) not null default 0
    check (crop_offset_x between -1 and 1),
  add column if not exists crop_offset_y numeric(7,4) not null default 0
    check (crop_offset_y between -1 and 1),
  add column if not exists rotation_degrees numeric(7,2) not null default 0
    check (rotation_degrees between -180 and 180);

create table if not exists public.artwork_print_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  status text not null default 'generated'
    check (status in ('generated', 'printed', 'cancelled')),
  page_count integer not null check (page_count > 0),
  copy_count integer not null check (copy_count > 0),
  profile_snapshot jsonb not null,
  artwork_snapshot jsonb not null,
  storage_path text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  printed_at timestamptz
);

create index if not exists idx_artwork_print_jobs_quote
  on public.artwork_print_jobs (tenant_id, quote_id, created_at desc);

alter table public.artwork_print_jobs enable row level security;

drop policy if exists artwork_print_jobs_tenant_all on public.artwork_print_jobs;
create policy artwork_print_jobs_tenant_all on public.artwork_print_jobs
  for all using (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id))
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_member(tenant_id));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'artwork-production',
        'artwork-production',
        false,
        15728640,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
      )
      on conflict (id) do update
        set public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $sql$;
  end if;
end
$$;
