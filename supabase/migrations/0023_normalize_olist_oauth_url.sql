update integration_connections
set
  settings = jsonb_set(
    settings,
    '{app_base_url}',
    to_jsonb('https://erp.tiny.com.br'::text),
    true
  ),
  updated_at = now()
where provider = 'olist'
  and settings->>'app_base_url' in ('https://erp.olist.com', 'http://erp.olist.com');

