alter table tenants
  add column if not exists pix_key_type text
    check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  add column if not exists pix_key text,
  add column if not exists pix_beneficiary_name text;

alter table quotes
  add column if not exists pix_payment_snapshot jsonb;

comment on column tenants.pix_key is
  'Chave Pix configurada pelo tenant. Não é uma credencial secreta e só é exposta quando copiada para um orçamento.';

comment on column quotes.pix_payment_snapshot is
  'Snapshot opcional da chave Pix exibida no orçamento, preservando o histórico quando a configuração do tenant mudar.';
