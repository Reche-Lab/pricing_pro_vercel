alter table public.quote_item_artworks
  drop constraint if exists quote_item_artworks_source_kind_check;

alter table public.quote_item_artworks
  add constraint quote_item_artworks_source_kind_check
    check (source_kind in ('upload', 'openrouter', 'retouch')),
  add column if not exists parent_artwork_id uuid
    references public.quote_item_artworks(id) on delete set null;

create index if not exists idx_quote_item_artworks_parent
  on public.quote_item_artworks (tenant_id, parent_artwork_id)
  where parent_artwork_id is not null;

comment on column public.quote_item_artworks.parent_artwork_id is
  'Arte original usada como base para uma versão derivada, como um retoque manual.';
