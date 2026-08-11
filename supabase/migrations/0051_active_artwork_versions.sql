alter table public.quote_item_artworks
  add column if not exists is_active boolean not null default true;

update public.quote_item_artworks original
set is_active = false
where exists (
  select 1
  from public.quote_item_artworks derived
  where derived.parent_artwork_id = original.id
    and derived.source_kind = 'retouch'
);

create index if not exists idx_quote_item_artworks_active
  on public.quote_item_artworks (tenant_id, quote_id, quote_item_id, created_at)
  where is_active = true;

comment on column public.quote_item_artworks.is_active is
  'Versão atualmente usada para enquadramento, aprovação e produção. Versões substituídas permanecem para consulta e restauração.';
