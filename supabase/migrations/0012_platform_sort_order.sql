alter table platform_rules
  add column if not exists sort_order integer not null default 1000;

with ordered as (
  select
    id,
    row_number() over (partition by tenant_id order by name, created_at, id) as position
  from platform_rules
)
update platform_rules pr
set sort_order = ordered.position
from ordered
where ordered.id = pr.id
  and pr.sort_order = 1000;

create index if not exists idx_platform_rules_tenant_sort_order
  on platform_rules (tenant_id, sort_order, name);
