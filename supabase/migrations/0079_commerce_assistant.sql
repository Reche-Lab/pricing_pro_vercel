-- Store assistant: all access goes through scoped backend handlers, never PostgREST.
create table if not exists commerce_assistant_settings (
  tenant_id uuid primary key references commerce_stores(tenant_id) on delete cascade,
  settings jsonb not null default '{}',
  enabled boolean not null default false,
  revision integer not null default 1,
  tested_revision integer,
  tested_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not enabled or (tested_revision is not null and tested_revision=revision))
);
create table if not exists commerce_assistant_limits (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  allowed boolean not null default true,
  model text not null default 'openai/gpt-4.1-mini',
  monthly_calls integer not null default 500 check(monthly_calls between 0 and 100000),
  monthly_tokens integer not null default 2000000 check(monthly_tokens between 0 and 100000000),
  monthly_usd numeric(12,4) not null default 10 check(monthly_usd between 0 and 10000),
  visitor_daily_turns integer not null default 20 check(visitor_daily_turns between 1 and 100),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists commerce_assistant_usage (
  tenant_id uuid not null references tenants(id) on delete cascade,
  month date not null,
  calls integer not null default 0,
  tokens bigint not null default 0,
  cost_usd numeric(12,6) not null default 0,
  primary key(tenant_id,month)
);
create unique index if not exists idx_commerce_sessions_tenant_id on commerce_sessions(tenant_id,id);
create table if not exists commerce_assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_id uuid not null,
  customer_id uuid references commerce_customers(id) on delete cascade,
  status text not null default 'active' check(status in ('active','handoff','closed')),
  busy_turn uuid,
  busy_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(tenant_id,id),
  foreign key(tenant_id,session_id) references commerce_sessions(tenant_id,id) on delete cascade
);
create index if not exists idx_assistant_conversations_tenant_session on commerce_assistant_conversations(tenant_id,session_id,created_at desc);
create index if not exists idx_assistant_conversations_expiry on commerce_assistant_conversations(expires_at);
alter table commerce_assistant_conversations add column if not exists consent_version text not null default '2026-11-13';
create table if not exists commerce_assistant_turns (
  id uuid primary key,
  tenant_id uuid not null,
  conversation_id uuid not null,
  state text not null default 'processing' check(state in ('processing','completed','failed')),
  request_hash text not null,
  created_at timestamptz not null default now(),
  unique(tenant_id,conversation_id,id),
  foreign key(tenant_id,conversation_id) references commerce_assistant_conversations(tenant_id,id) on delete cascade
);
create table if not exists commerce_assistant_visitor_usage (
  tenant_id uuid not null,
  session_id uuid not null,
  day date not null,
  turns integer not null default 0,
  primary key(tenant_id,session_id,day),
  foreign key(tenant_id,session_id) references commerce_sessions(tenant_id,id) on delete cascade
);
create table if not exists commerce_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null,
  role text not null check(role in ('user','assistant')),
  payload_encrypted text not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,conversation_id) references commerce_assistant_conversations(tenant_id,id) on delete cascade
);
create index if not exists idx_assistant_messages_conversation on commerce_assistant_messages(tenant_id,conversation_id,created_at);
create table if not exists commerce_assistant_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null,
  payload_encrypted text not null,
  applied_at timestamptz,
  expires_at timestamptz not null default now()+interval '15 minutes',
  foreign key(tenant_id,conversation_id) references commerce_assistant_conversations(tenant_id,id) on delete cascade
);
create table if not exists commerce_assistant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references commerce_stores(tenant_id) on delete cascade,
  label text not null check(length(label) between 2 and 100),
  file_name text not null,
  storage_path text not null,
  file_size integer not null check(file_size between 1 and 2097152),
  visibility text not null default 'identified' check(visibility in ('public','identified')),
  active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_assistant_documents_tenant on commerce_assistant_documents(tenant_id) where active;
do $$ declare name text; begin
  foreach name in array array['commerce_assistant_settings','commerce_assistant_limits','commerce_assistant_usage','commerce_assistant_conversations','commerce_assistant_turns','commerce_assistant_visitor_usage','commerce_assistant_messages','commerce_assistant_actions','commerce_assistant_documents'] loop
    execute format('alter table %I enable row level security',name);
    execute format('revoke all on %I from public,anon,authenticated',name);
  end loop;
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('commerce-assistant-documents','commerce-assistant-documents',false,2097152,array['application/pdf'])
      on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['application/pdf'];
  end if;
end $$;
