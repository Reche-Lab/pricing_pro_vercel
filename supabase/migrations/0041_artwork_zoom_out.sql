alter table public.quote_item_artworks
  drop constraint if exists quote_item_artworks_crop_scale_check;

alter table public.quote_item_artworks
  add constraint quote_item_artworks_crop_scale_check
    check (crop_scale between 0.1 and 5);
