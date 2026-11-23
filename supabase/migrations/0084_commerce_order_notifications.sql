-- Transactional outbox only: no historical backfill and no network I/O in triggers.
create table commerce_order_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  event_type text not null check (event_type in (
    'order.created','payment.paid','payment.refunded',
    'fulfillment.production','fulfillment.shipped','fulfillment.completed',
    'artwork.publish','shipping.posted','shipping.delivered','shipping.exception','shipping.tracking_available'
  )),
  event_key text not null,
  source_event_id uuid references commerce_order_events(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,order_id,event_key),
  foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id) on delete cascade,
  check ((status='sending') = (claim_token is not null and claim_expires_at is not null)),
  check ((claim_token is null) = (claim_expires_at is null)),
  check ((status='sent') = (sent_at is not null))
);
create index commerce_order_notifications_due on commerce_order_notifications(next_attempt_at,created_at)
  where status='pending';
create index commerce_order_notifications_expired on commerce_order_notifications(claim_expires_at)
  where status='sending';
create index commerce_order_notifications_scope on commerce_order_notifications(tenant_id,order_id,created_at);

alter table commerce_order_notifications enable row level security;
revoke all on commerce_order_notifications from public,anon,authenticated;
-- Diagnostics only; enqueue/claim/settlement remain server-only operations.
create policy commerce_order_notifications_admin_read on commerce_order_notifications for select
  using (current_user_is_super_admin() or
    (tenant_id=current_tenant_id() and current_user_has_permission('settings:manage')));

create function enqueue_commerce_order_notifications() returns trigger
language plpgsql set search_path=public as $$
declare events text[] := array[]::text[]; event_name text;
begin
  if new.payment_environment <> 'production' or new.cancelled_at is not null or new.deleted_at is not null then
    return new;
  end if;
  if tg_op='INSERT' then
    events := array_append(events,'order.created');
  end if;
  if new.payment_status in ('paid','refunded') then
    if tg_op='INSERT' then
      events := array_append(events,'payment.' || new.payment_status);
    elsif old.payment_status is distinct from new.payment_status then
      events := array_append(events,'payment.' || new.payment_status);
    end if;
  end if;
  if new.fulfillment_status in ('production','shipped','completed') then
    if tg_op='INSERT' then
      events := array_append(events,'fulfillment.' || new.fulfillment_status);
    elsif old.fulfillment_status is distinct from new.fulfillment_status then
      events := array_append(events,'fulfillment.' || new.fulfillment_status);
    end if;
  end if;
  foreach event_name in array events loop
    insert into commerce_order_notifications(tenant_id,order_id,event_type,event_key)
    values(new.tenant_id,new.id,event_name,event_name)
    on conflict(tenant_id,order_id,event_key) do nothing;
  end loop;
  return new;
end $$;
create trigger commerce_order_notifications_outbox after insert or update on commerce_orders
  for each row execute function enqueue_commerce_order_notifications();

create function enqueue_commerce_order_event_notification() returns trigger
language plpgsql set search_path=public as $$
declare dedupe_key text; tracking_code_value text;
begin
  if new.type not in ('artwork.publish','shipping.posted','shipping.delivered','shipping.exception','shipping.tracking_available') then
    return new;
  end if;
  if not exists (select 1 from commerce_orders o where o.tenant_id=new.tenant_id and o.id=new.order_id
    and o.payment_environment='production' and o.cancelled_at is null and o.deleted_at is null) then
    return new;
  end if;
  -- Shipping and manual fulfillment share the same buyer milestones, in either insertion order.
  dedupe_key := case new.type when 'shipping.posted' then 'fulfillment.shipped'
    when 'shipping.delivered' then 'fulfillment.completed' else new.type end;
  if new.type='shipping.tracking_available' then
    -- One notification per distinct normalized code, including additional volumes.
    -- Reordered sets, repeated callbacks and a changed URL do not resend a code.
    for tracking_code_value in
      select distinct upper(btrim(code)) from (
        select new.metadata->>'trackingCode' as code
        union all select jsonb_array_elements_text(case when jsonb_typeof(new.metadata->'trackingCodes')='array'
          then new.metadata->'trackingCodes' else '[]'::jsonb end)
        union all select parcel->>'trackingCode' from jsonb_array_elements(case when jsonb_typeof(new.metadata->'parcels')='array'
          then new.metadata->'parcels' else '[]'::jsonb end) parcel
        union all select s.tracking_code from commerce_order_shipments s
          where s.tenant_id=new.tenant_id and s.order_id=new.order_id
        union all select p.tracking_code from commerce_order_shipment_parcels p
          join commerce_order_shipments s on s.tenant_id=p.tenant_id and s.id=p.shipment_id
          where s.tenant_id=new.tenant_id and s.order_id=new.order_id
      ) codes where btrim(code) ~ '^[a-zA-Z0-9._-]{3,100}$'
    loop
      insert into commerce_order_notifications(tenant_id,order_id,event_type,event_key,source_event_id)
      values(new.tenant_id,new.order_id,new.type,dedupe_key || ':' || md5(tracking_code_value),new.id)
      on conflict(tenant_id,order_id,event_key) do nothing;
    end loop;
    return new;
  end if;
  if new.type='artwork.publish' then
    if coalesce(new.metadata->>'lineId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(new.metadata->>'revision','') !~ '^[1-9][0-9]{0,9}$' then return new; end if;
    dedupe_key := dedupe_key || ':' || lower(new.metadata->>'lineId') || ':' || (new.metadata->>'revision');
  end if;
  insert into commerce_order_notifications(tenant_id,order_id,event_type,event_key,source_event_id)
  values(new.tenant_id,new.order_id,new.type,dedupe_key,new.id)
  on conflict(tenant_id,order_id,event_key) do nothing;
  return new;
end $$;
create trigger commerce_order_event_notification_outbox after insert on commerce_order_events
  for each row execute function enqueue_commerce_order_event_notification();
revoke all on function enqueue_commerce_order_notifications(), enqueue_commerce_order_event_notification() from public,anon,authenticated;
