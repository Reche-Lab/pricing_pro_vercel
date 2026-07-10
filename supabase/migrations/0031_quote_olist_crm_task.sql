alter table quotes
  add column if not exists external_crm_task_id text,
  add column if not exists external_crm_task_created_at timestamptz,
  add column if not exists external_crm_task_response jsonb;

create index if not exists idx_quotes_tenant_external_crm_task
  on quotes (tenant_id, external_crm_task_id)
  where external_crm_task_id is not null;
