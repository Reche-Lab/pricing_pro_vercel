alter table public.quotes
  add column if not exists edit_reopened_at timestamptz,
  add column if not exists edit_reopened_by uuid references public.app_users(id),
  add column if not exists edit_reopened_reason text,
  add column if not exists edit_relocked_at timestamptz;

create index if not exists idx_quotes_tenant_edit_reopened
  on public.quotes (tenant_id, edit_reopened_at desc)
  where edit_reopened_at is not null;
