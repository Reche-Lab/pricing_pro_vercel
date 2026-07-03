insert into permissions (key, description)
values ('quotes:delete', 'Delete quotes')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'quotes:delete'
where r.key = 'owner'
on conflict do nothing;
