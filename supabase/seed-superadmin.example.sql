-- Rode depois da migration 0016 para promover um usuario existente a superadmin.
-- Substitua pelo email do usuario que devera enxergar o ambiente /superadmin.

update app_users
set is_super_admin = true,
    updated_at = now()
where lower(email::text) = lower('liaflow.ai@gmail.com');
