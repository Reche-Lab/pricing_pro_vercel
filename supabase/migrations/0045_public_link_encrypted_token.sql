alter table public.quotes
  add column if not exists public_token_encrypted text;

comment on column public.quotes.public_token_encrypted is
  'Token do link público criptografado com APP_ENCRYPTION_KEY para recuperação somente pelo backend autenticado.';
