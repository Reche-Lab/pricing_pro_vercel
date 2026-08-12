alter table public.product_variants
  add column if not exists print_bleed_mm numeric(6,2) not null default 2
    check (print_bleed_mm >= 0 and print_bleed_mm <= 50),
  add column if not exists print_safe_margin_mm numeric(6,2) not null default 2
    check (print_safe_margin_mm >= 0 and print_safe_margin_mm <= 50);

comment on column public.product_variants.print_bleed_mm is
  'Sangria externa ao contorno final de corte, em milimetros.';

comment on column public.product_variants.print_safe_margin_mm is
  'Margem interna de seguranca medida a partir do contorno final de corte, em milimetros.';
