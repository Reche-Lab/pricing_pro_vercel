alter table public.product_variants
  add column if not exists print_shape text not null default 'circle'
    check (print_shape in ('circle', 'square', 'rectangle', 'triangle', 'hexagon')),
  add column if not exists print_width_mm numeric(8,2),
  add column if not exists print_height_mm numeric(8,2),
  add column if not exists print_corner_style text not null default 'sharp'
    check (print_corner_style in ('sharp', 'rounded')),
  add column if not exists print_corner_radius_mm numeric(8,2) not null default 0
    check (print_corner_radius_mm >= 0),
  add column if not exists print_shape_rotation_degrees numeric(7,2) not null default 0
    check (print_shape_rotation_degrees between -180 and 180),
  add column if not exists allow_print_rotation boolean not null default true;

update public.product_variants
set print_width_mm = coalesce(print_width_mm, print_diameter_mm),
    print_height_mm = coalesce(print_height_mm, print_diameter_mm)
where print_diameter_mm is not null;

alter table public.quote_item_artworks
  add column if not exists target_shape text
    check (target_shape is null or target_shape in ('circle', 'square', 'rectangle', 'triangle', 'hexagon')),
  add column if not exists target_width_mm numeric(8,2),
  add column if not exists target_height_mm numeric(8,2),
  add column if not exists target_corner_style text
    check (target_corner_style is null or target_corner_style in ('sharp', 'rounded')),
  add column if not exists target_corner_radius_mm numeric(8,2),
  add column if not exists target_shape_rotation_degrees numeric(7,2),
  add column if not exists target_allow_print_rotation boolean;

update public.quote_item_artworks
set target_shape = coalesce(target_shape, 'circle'),
    target_width_mm = coalesce(target_width_mm, target_diameter_mm),
    target_height_mm = coalesce(target_height_mm, target_diameter_mm),
    target_corner_style = coalesce(target_corner_style, 'sharp'),
    target_corner_radius_mm = coalesce(target_corner_radius_mm, 0),
    target_shape_rotation_degrees = coalesce(target_shape_rotation_degrees, 0),
    target_allow_print_rotation = coalesce(target_allow_print_rotation, true)
where target_diameter_mm is not null;
