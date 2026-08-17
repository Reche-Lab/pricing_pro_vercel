alter table public.tenants
  add column if not exists requires_legal_acceptance boolean not null default false;

create table if not exists public.tenant_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email citext not null,
  whatsapp text not null,
  company_name text not null,
  business_segment text,
  intended_use text,
  status text not null default 'pending_email'
    check (status in ('pending_email', 'pending_review', 'needs_information', 'approved', 'rejected', 'expired', 'cancelled')),
  verification_token_hash text unique,
  verification_expires_at timestamptz,
  email_verified_at timestamptz,
  public_token_hash text not null unique,
  reviewed_by uuid references public.app_users(id),
  reviewed_at timestamptz,
  review_notes text,
  applicant_response text,
  rejection_reason text,
  approved_tenant_id uuid references public.tenants(id),
  approved_user_id uuid references public.app_users(id),
  source text not null default 'public_signup',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_access_requests_open_email
  on public.tenant_access_requests (email)
  where status in ('pending_email', 'pending_review', 'needs_information');

create index if not exists idx_access_requests_status_created
  on public.tenant_access_requests (status, created_at desc);

create table if not exists public.tenant_access_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_access_requests(id) on delete cascade,
  actor_user_id uuid references public.app_users(id),
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_request_events_request_created
  on public.tenant_access_request_events (request_id, created_at desc);

create table if not exists public.legal_terms (
  id uuid primary key default gen_random_uuid(),
  product_code text not null default 'pricing_pro',
  version text not null,
  locale text not null default 'pt-BR',
  title text not null,
  content_text text not null,
  content_hash text not null,
  is_active boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_code, version, locale)
);

create unique index if not exists idx_legal_terms_one_active_locale
  on public.legal_terms (product_code, locale)
  where is_active = true;

create table if not exists public.legal_term_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  term_id uuid not null references public.legal_terms(id) on delete restrict,
  product_code text not null default 'pricing_pro',
  term_version text not null,
  accepted_locale text not null default 'pt-BR',
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  email text,
  user_name text,
  role text,
  content_hash text not null,
  email_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, product_code, term_version)
);

create index if not exists idx_legal_acceptances_tenant_user
  on public.legal_term_acceptances (tenant_id, user_id, accepted_at desc);

alter table public.tenant_access_requests enable row level security;
alter table public.tenant_access_request_events enable row level security;
alter table public.legal_terms enable row level security;
alter table public.legal_term_acceptances enable row level security;

drop policy if exists access_requests_superadmin_select on public.tenant_access_requests;
create policy access_requests_superadmin_select on public.tenant_access_requests
  for select using (current_user_is_super_admin());

drop policy if exists access_requests_superadmin_update on public.tenant_access_requests;
create policy access_requests_superadmin_update on public.tenant_access_requests
  for update using (current_user_is_super_admin())
  with check (current_user_is_super_admin());

drop policy if exists access_request_events_superadmin_select on public.tenant_access_request_events;
create policy access_request_events_superadmin_select on public.tenant_access_request_events
  for select using (current_user_is_super_admin());

drop policy if exists legal_terms_authenticated_select on public.legal_terms;
create policy legal_terms_authenticated_select on public.legal_terms
  for select using (is_active = true or current_user_is_super_admin());

drop policy if exists legal_acceptances_own_select on public.legal_term_acceptances;
create policy legal_acceptances_own_select on public.legal_term_acceptances
  for select using (
    (tenant_id = current_tenant_id() and user_id = current_app_user_id())
    or current_user_is_super_admin()
  );

with active_term as (
  select
    'pricing_pro'::text as product_code,
    '2026-08-16'::text as version,
    'pt-BR'::text as locale,
    'Termos de Uso, Compromisso Operacional e Aviso de Privacidade do Pricing Pro'::text as title,
    $terms$
TERMOS DE USO, COMPROMISSO OPERACIONAL E AVISO DE PRIVACIDADE DO PRICING PRO
Versão 2026-08-16

1. Objeto da plataforma
O Pricing Pro é uma plataforma de apoio à precificação, criação de orçamentos, cálculo de fretes, preparação de artes e integração com serviços externos. Os resultados são ferramentas de apoio e devem ser revisados pelo usuário antes de serem utilizados comercialmente.

2. Responsabilidade por preços e orçamentos
O usuário e a empresa que representa são responsáveis por cadastrar e revisar custos, margens, comissões, descontos, impostos, medidas, pesos, quantidades, prazos e demais regras comerciais. O Pricing Pro não garante que um preço calculado seja lucrativo, fiscalmente adequado ou compatível com obrigações assumidas perante clientes.

3. Pedidos, documentos fiscais e integrações
Pedidos de venda, dados de clientes, notas fiscais, etiquetas e informações de transporte enviados ao Olist, Correios, Melhor Envio, Mercado Pago ou outros provedores devem ser conferidos pelo usuário. A disponibilidade, autorização e correção dessas operações também dependem dos serviços externos e das credenciais fornecidas pelo cliente.

4. Artes, impressão e propriedade intelectual
O usuário declara possuir autorização para armazenar, editar, reproduzir e imprimir as imagens e marcas enviadas à plataforma. Arquivos gerados ou ajustados por inteligência artificial podem conter erros, diferenças visuais ou conteúdo inadequado. Medidas, sangrias, margens de segurança, cores, resolução e folhas de impressão devem ser revisadas antes da produção.

5. Inteligência artificial
Recursos de inteligência artificial produzem sugestões e resultados probabilísticos. O usuário deve revisar todo conteúdo antes de aprová-lo, apresentá-lo ao cliente, imprimi-lo ou explorá-lo comercialmente. A plataforma não substitui trabalho técnico, jurídico, contábil, fiscal ou de design especializado quando este for necessário.

6. Dados pessoais e LGPD
Em regra, a empresa usuária é controladora dos dados pessoais de clientes, destinatários e colaboradores que insere na plataforma. Ela deve possuir base legal adequada, informar os titulares quando aplicável, manter os dados corretos e atender aos direitos previstos na legislação. O Pricing Pro atua como fornecedor de tecnologia e pode tratar dados para execução do serviço, segurança, suporte, auditoria, cobrança e cumprimento de obrigações legais.

7. Segurança e credenciais
O usuário deve proteger senhas, tokens e credenciais de integração, conceder apenas os acessos necessários e comunicar suspeitas de uso indevido. É proibido tentar invadir a plataforma, contornar limites, explorar falhas, acessar dados de outro tenant, distribuir código malicioso ou utilizar o serviço para atividades ilegais.

8. Serviços externos e disponibilidade
A plataforma pode depender de APIs, meios de pagamento, serviços de e-mail, armazenamento, inteligência artificial, ERP e transportadoras. O Pricing Pro não controla indisponibilidades, alterações de API, rejeições, atrasos, bloqueios ou decisões desses terceiros, mas poderá adotar medidas razoáveis para diagnosticar e corrigir integrações sob seu controle.

9. Cobrança, trial e suspensão
O acesso pode estar sujeito a trial, plano contratado, limites de uso e pagamento. A plataforma pode restringir ou suspender o tenant em caso de inadimplência, fraude, abuso, risco técnico ou jurídico, violação destes termos ou necessidade de proteção dos usuários e da infraestrutura.

10. Logs e auditoria
Para segurança, suporte, rastreabilidade e comprovação de aceite, poderão ser registrados data e hora, IP, navegador, usuário, tenant, operações realizadas, alterações manuais, eventos de integração e informações técnicas necessárias.

11. Aceite digital
Ao marcar a opção de concordância, o usuário confirma que leu e compreendeu estes termos e que possui autorização para aceitá-los em nome próprio e, quando aplicável, em nome da empresa que representa.
$terms$::text as content_text
)
insert into public.legal_terms (
  product_code, version, locale, title, content_text, content_hash, is_active, published_at
)
select
  product_code,
  version,
  locale,
  title,
  content_text,
  encode(digest(content_text, 'sha256'), 'hex'),
  true,
  now()
from active_term
on conflict (product_code, version, locale) do update set
  title = excluded.title,
  content_text = excluded.content_text,
  content_hash = excluded.content_hash,
  is_active = true,
  published_at = coalesce(public.legal_terms.published_at, excluded.published_at),
  updated_at = now();

update public.legal_terms
set is_active = false, updated_at = now()
where product_code = 'pricing_pro'
  and locale = 'pt-BR'
  and version <> '2026-08-16';

comment on table public.tenant_access_requests is 'Public requests awaiting email verification and superadmin approval before tenant provisioning.';
comment on table public.legal_term_acceptances is 'Immutable evidence of acceptance for a specific legal term version, user and tenant.';
