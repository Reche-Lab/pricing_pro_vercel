alter table artwork_production_profiles
  add column if not exists side_margin_mm numeric(6,2) not null default 4;

alter table artwork_production_profiles
  drop constraint if exists artwork_production_profiles_side_margin_check;

alter table artwork_production_profiles
  add constraint artwork_production_profiles_side_margin_check
  check (side_margin_mm >= 0 and side_margin_mm <= 50);

comment on column artwork_production_profiles.side_margin_mm is
  'Margem física independente aplicada aos lados esquerdo e direito da folha de produção.';
