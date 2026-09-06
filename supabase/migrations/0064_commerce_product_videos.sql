-- Product galleries remain in commerce_products.snapshot. Only video uploads
-- need a registry: signed uploads are private until the server validates them.
create table if not exists commerce_video_uploads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  created_by uuid not null references app_users(id),
  file_name text not null,
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm')),
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  completed_at timestamptz
);
create index if not exists commerce_video_uploads_tenant_status on commerce_video_uploads (tenant_id, status, created_at);
alter table commerce_video_uploads enable row level security;
revoke all on commerce_video_uploads from public, anon, authenticated;
drop policy if exists commerce_video_admin on commerce_video_uploads;
create policy commerce_video_admin on commerce_video_uploads for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'));

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('commerce-video-staging', 'commerce-video-staging', false, 20971520, array['video/mp4','video/webm']),
           ('commerce-videos', 'commerce-videos', true, 20971520, array['video/mp4','video/webm'])
    on conflict (id) do update set public = excluded.public,
      file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
-- Do not add browser write policies. Private uploads use signed, exact paths;
-- only service_role publishes validated files to commerce-videos.
