alter table public.quotes
  add column if not exists public_link_revoked_at timestamptz,
  add column if not exists public_require_otp boolean not null default false,
  add column if not exists public_otp_hash text,
  add column if not exists public_otp_expires_at timestamptz,
  add column if not exists public_otp_attempts integer not null default 0
    check (public_otp_attempts >= 0);

-- Links já emitidos também passam a respeitar a nova janela máxima.
update public.quotes
set public_token_expires_at = least(public_token_expires_at, now() + interval '3 days')
where public_token_hash is not null
  and public_token_expires_at > now() + interval '3 days';

create table if not exists public.public_request_limits (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (key_hash, action, window_started_at)
);

create index if not exists idx_public_request_limits_expires
  on public.public_request_limits (expires_at);

alter table public.public_request_limits enable row level security;

revoke all on table public.public_request_limits from anon, authenticated;

comment on table public.public_request_limits is
  'Contadores efêmeros de rate limit dos endpoints públicos, identificados somente por hashes.';
