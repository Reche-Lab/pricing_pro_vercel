-- Public storefront photos only. Customer artwork stays in the private bucket.
-- Uploads run exclusively through the authenticated admin API with service_role.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('commerce-media', 'commerce-media', true, 5242880, array['image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
