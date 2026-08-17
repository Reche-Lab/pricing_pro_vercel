# Onboarding de novos tenants

## Fluxo

1. O interessado acessa `/request-access`, informa seus dados e aceita o aviso de privacidade.
2. O backend normaliza o WhatsApp, aplica rate limit e envia um link de confirmação válido por 24 horas.
3. Depois da confirmação, a solicitação aparece em `Superadmin > Solicitações de novos tenants`.
4. O superadmin pode pedir informações, rejeitar ou aprovar. A aprovação exige slug, plano, trial e limite de IA.
5. A aprovação cria tenant, owner convidado, assinatura trial e convite em uma única transação.
6. O owner define a senha pelo convite e é encaminhado para `/terms`.
7. O aceite vigente é registrado com versão, hash, usuário, tenant, IP e navegador. Uma cópia é enviada por e-mail.
8. O usuário segue para `/onboarding`, com atalhos para empresa, produtos, canais e embalagens.

## Estados

- `pending_email`: confirmação ainda não realizada.
- `pending_review`: pronta para análise.
- `needs_information`: solicitante deve responder pelo link de acompanhamento.
- `approved`: tenant provisionado e convite criado.
- `rejected`, `expired` e `cancelled`: estados finais sem provisionamento.

## Segurança

- Tokens aleatórios são armazenados somente como SHA-256.
- Respostas do cadastro não revelam se o e-mail já possui conta.
- Há rate limit por origem e limite adicional persistido por IP.
- Solicitações sem confirmação não podem ser aprovadas.
- Tenant e usuário não são criados antes da aprovação.
- Páginas e APIs operacionais retornam bloqueio enquanto faltar o aceite vigente.
- Tenants existentes não são bloqueados retroativamente; o novo fluxo marca `requires_legal_acceptance` ao provisionar.

## Termos

O termo fica em `legal_terms` e os aceites em `legal_term_acceptances`. Para publicar nova versão:

1. Insira a versão com `product_code = 'pricing_pro'`, conteúdo e hash.
2. Marque somente essa versão como ativa para `pt-BR`.
3. Atualize `ACTIVE_LEGAL_TERM_VERSION` em `src/domain/legal/terms.ts`.
4. Usuários de tenants sujeitos ao termo deverão aceitar a nova versão na próxima sessão.

O conteúdo fornecido na migration é uma base operacional e deve passar por revisão jurídica antes do uso comercial definitivo.
