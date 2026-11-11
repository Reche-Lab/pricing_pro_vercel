alter table quote_item_artworks
  add column if not exists crop_background_color text
    check (crop_background_color is null or (length(crop_background_color) = 7 and crop_background_color ~ '^#[0-9a-fA-F]{6}$'));
