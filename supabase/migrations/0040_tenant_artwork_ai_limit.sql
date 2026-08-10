alter table public.tenants
  add column if not exists artwork_ai_generation_limit integer not null default 3
    check (artwork_ai_generation_limit between 0 and 100);

alter table public.quote_items
  add column if not exists artwork_ai_attempts integer not null default 0;

alter table public.quote_items
  drop constraint if exists quote_items_artwork_ai_attempts_check;

alter table public.quote_items
  drop constraint if exists quote_items_artwork_ai_attempts_nonnegative;

alter table public.quote_items
  add constraint quote_items_artwork_ai_attempts_nonnegative
    check (artwork_ai_attempts >= 0);

update public.quote_items qi
set artwork_ai_attempts = generated.total
from (
  select quote_item_id, count(*)::integer as total
  from public.quote_item_artworks
  where source_kind = 'openrouter'
  group by quote_item_id
) generated
where qi.id = generated.quote_item_id
  and qi.artwork_ai_attempts = 0;
