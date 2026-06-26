-- 1. Rode o script abaixo localmente para gerar o hash:
--    node scripts/hash-password.mjs 'SUA_SENHA_FORTE'
--
-- 2. Substitua os placeholders deste arquivo e rode no SQL Editor do Supabase.

with inserted_user as (
  insert into app_users (email, name, password_hash, status)
  values (
    'liaflow.ai@gmail.com', // Substitua pelo email do usuário administrador
    'Admin',
    '$2a$12$.0Mwmbv.t8ZclNM2PtR/m.4NZt45sU2fwxOF7wzsK9CF6si8u6g4.', // Substitua pelo hash gerado no passo 1
    'active'
  )
  on conflict (email) do update
    set name = excluded.name,
        password_hash = excluded.password_hash,
        status = 'active',
        updated_at = now()
  returning id
),
target_tenant as (
  select id from tenants where slug = 'ground-shop'
),
owner_role as (
  select id from roles where key = 'owner'
)
insert into tenant_members (tenant_id, user_id, role_id, status, joined_at)
select target_tenant.id, inserted_user.id, owner_role.id, 'active', now()
from inserted_user, target_tenant, owner_role
on conflict (tenant_id, user_id) do update
  set role_id = excluded.role_id,
      status = 'active',
      joined_at = coalesce(tenant_members.joined_at, now()),
      updated_at = now();
