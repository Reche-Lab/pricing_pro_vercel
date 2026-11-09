-- Existing records retain their original integration; no credentials are copied.
alter table commerce_payment_connections
  add column if not exists payment_environment text not null default 'production'
    check (payment_environment in ('production','test')),
  add column if not exists test_public_key text not null default '',
  add column if not exists test_encrypted_credentials text;
alter table commerce_orders
  add column if not exists payment_environment text not null default 'production'
    check (payment_environment in ('production','test'));
alter table commerce_payment_attempts
  add column if not exists payment_environment text not null default 'production'
    check (payment_environment in ('production','test'));
create index if not exists commerce_orders_environment_created
  on commerce_orders(tenant_id,payment_environment,created_at desc);
