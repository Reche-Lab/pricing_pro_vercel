alter table public.quote_items
  add column if not exists artwork_ai_attempts integer not null default 0
    check (artwork_ai_attempts between 0 and 3);

update public.quote_items qi
set artwork_ai_attempts = least(3, generated.total)
from (
  select quote_item_id, count(*)::integer as total
  from public.quote_item_artworks
  where source_kind = 'openrouter'
  group by quote_item_id
) generated
where qi.id = generated.quote_item_id
  and qi.artwork_ai_attempts = 0;
