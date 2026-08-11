alter table public.quotes
  add column if not exists discount_type text not null default 'none'
    check (discount_type in ('none', 'fixed', 'percent')),
  add column if not exists discount_value numeric(12,4) not null default 0
    check (discount_value >= 0),
  add column if not exists discount_reason text;

update public.quotes
set discount_type = 'fixed',
    discount_value = discount_total
where discount_total > 0
  and discount_type = 'none';

comment on column public.quotes.discount_total is
  'Valor monetário final do desconto aplicado somente ao subtotal dos produtos.';
