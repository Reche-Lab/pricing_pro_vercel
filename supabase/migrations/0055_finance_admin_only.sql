delete from role_permissions rp
using roles r, permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and p.key like 'finance:%'
  and r.key not in ('owner', 'admin');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.key in ('owner', 'admin')
  and p.key like 'finance:%'
on conflict do nothing;
