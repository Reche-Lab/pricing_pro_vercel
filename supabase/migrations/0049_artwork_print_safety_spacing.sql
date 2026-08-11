alter table public.artwork_production_profiles
  add column if not exists bottom_margin_mm numeric(6,2) not null default 15;

update public.artwork_production_profiles
set gap_mm = greatest(gap_mm, 3),
    bottom_margin_mm = greatest(bottom_margin_mm, 10);

alter table public.artwork_production_profiles
  drop constraint if exists artwork_production_profiles_min_gap_check,
  drop constraint if exists artwork_production_profiles_bottom_margin_check;

alter table public.artwork_production_profiles
  add constraint artwork_production_profiles_min_gap_check check (gap_mm >= 3),
  add constraint artwork_production_profiles_bottom_margin_check check (bottom_margin_mm >= 10);

comment on column public.artwork_production_profiles.bottom_margin_mm is
  'Margem inferior reservada para proteger a folha e o mecanismo de tração da impressora.';
