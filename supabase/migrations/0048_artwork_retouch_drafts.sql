alter table public.quote_item_artworks
  add column if not exists retouch_draft jsonb,
  add column if not exists retouch_draft_updated_at timestamptz;

comment on column public.quote_item_artworks.retouch_draft is
  'Operações não destrutivas do editor antes da criação de uma nova versão da arte.';
