create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  logo_url text,
  default_currency char(3) not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'invited', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role_id uuid not null references roles(id),
  status text not null default 'active' check (status in ('active', 'invited', 'blocked')),
  invited_by uuid references app_users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  sku text,
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  unit_weight_kg numeric(12,6) not null default 0 check (unit_weight_kg >= 0),
  height_cm numeric(12,3),
  width_cm numeric(12,3),
  length_cm numeric(12,3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, name)
);

create table if not exists pricing_curves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  name text not null,
  method text not null default 'anchors' check (method in ('anchors', 'logistic')),
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_variant_id, version)
);

create table if not exists pricing_anchors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pricing_curve_id uuid not null references pricing_curves(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,4) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pricing_curve_id, quantity)
);

create table if not exists platform_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  name text not null,
  commission_rate numeric(8,6) not null default 0 check (commission_rate >= 0 and commission_rate < 1),
  fixed_fee numeric(12,4) not null default 0 check (fixed_fee >= 0),
  seller_shipping_cost numeric(12,4) not null default 0 check (seller_shipping_cost >= 0),
  seller_shipping_threshold numeric(12,4) not null default 0 check (seller_shipping_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists packaging_boxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  height_cm numeric(12,3) not null check (height_cm > 0),
  width_cm numeric(12,3) not null check (width_cm > 0),
  length_cm numeric(12,3) not null check (length_cm > 0),
  weight_kg numeric(12,6) not null default 0 check (weight_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists packaging_capacities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  packaging_box_id uuid not null references packaging_boxes(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, packaging_box_id, product_variant_id)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  document text,
  email citext,
  phone text,
  postal_code text,
  address_line text,
  city text,
  state text,
  external_olist_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid references customers(id),
  created_by uuid references app_users(id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  valid_until date,
  subtotal numeric(12,4) not null default 0,
  shipping_total numeric(12,4) not null default 0,
  discount_total numeric(12,4) not null default 0,
  grand_total numeric(12,4) not null default 0,
  margin_amount numeric(12,4) not null default 0,
  margin_percent numeric(8,4) not null default 0,
  external_crm_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,4) not null default 0,
  total_price numeric(12,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists quote_calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  credentials_encrypted text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists integration_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  operation text not null,
  status text not null check (status in ('success', 'error', 'pending')),
  external_id text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_members_user_id on tenant_members(user_id);
create index if not exists idx_products_tenant_id on products(tenant_id);
create index if not exists idx_product_variants_tenant_id on product_variants(tenant_id);
create index if not exists idx_pricing_curves_tenant_variant on pricing_curves(tenant_id, product_variant_id);
create index if not exists idx_quotes_tenant_status on quotes(tenant_id, status);
create index if not exists idx_customers_tenant_name on customers(tenant_id, name);
create index if not exists idx_integration_logs_tenant_provider on integration_logs(tenant_id, provider, created_at desc);
create index if not exists idx_audit_logs_tenant_created on audit_logs(tenant_id, created_at desc);

insert into roles (key, name)
values
  ('owner', 'Owner'),
  ('admin', 'Admin'),
  ('manager', 'Manager'),
  ('sales', 'Sales'),
  ('viewer', 'Viewer'),
  ('support', 'Support')
on conflict (key) do nothing;

insert into permissions (key, description)
values
  ('products:read', 'Read products'),
  ('products:write', 'Write products'),
  ('pricing:read', 'Read pricing rules'),
  ('pricing:write', 'Write pricing rules'),
  ('quotes:read', 'Read quotes'),
  ('quotes:write', 'Write quotes'),
  ('quotes:approve', 'Approve quotes'),
  ('customers:read', 'Read customers'),
  ('customers:write', 'Write customers'),
  ('users:manage', 'Manage users'),
  ('integrations:manage', 'Manage integrations'),
  ('settings:manage', 'Manage tenant settings')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.key in ('owner', 'admin')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in (
  'products:read',
  'products:write',
  'pricing:read',
  'pricing:write',
  'quotes:read',
  'quotes:write',
  'customers:read',
  'customers:write'
)
where r.key = 'manager'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('products:read', 'pricing:read', 'quotes:read', 'quotes:write', 'customers:read', 'customers:write')
where r.key = 'sales'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('products:read', 'pricing:read', 'quotes:read', 'customers:read')
where r.key = 'viewer'
on conflict do nothing;
