# Checklist de Implementacao

Status atualizado durante a refatoracao inicial.

## Planejado x Realizado

- [x] Criar documento de arquitetura multi-tenant.
- [x] Criar fundacao NextJS com TypeScript.
- [x] Configurar Tailwind, Vitest e TypeScript.
- [x] Criar dominio puro de precificacao.
- [x] Criar testes TDD para precificacao.
- [x] Criar dominio puro de embalagem/frete.
- [x] Criar testes TDD para embalagem.
- [x] Criar validacao testada de CPF/CNPJ.
- [x] Criar migrations multi-tenant para Supabase/Postgres.
- [x] Criar RBAC inicial com roles e permissions.
- [x] Criar RLS basica por tenant.
- [x] Criar seed inicial de produtos Botton e curvas atuais.
- [x] Criar script para gerar hash de senha.
- [x] Criar exemplo de seed do usuario owner.
- [x] Criar `.env.example`.
- [x] Criar `.env` local com placeholders.
- [x] Remover configuracoes por tenant do `.env`.
- [x] Criar migration para perfil do tenant e integracoes por tenant.
- [x] Criar utilitario para criptografar credenciais por tenant.
- [x] Implementar conexao Postgres.
- [x] Implementar auth inicial com cookie HttpOnly e JWT assinado.
- [x] Implementar login/logout.
- [x] Implementar API `/api/me`.
- [x] Implementar API `/api/products`.
- [x] Implementar API `/api/pricing/calculate`.
- [x] Implementar API `/api/customers`.
- [x] Implementar API `/api/quotes`.
- [x] Criar demo publica com dados ficticios.
- [x] Criar dashboard autenticado.
- [x] Criar precificador inicial autenticado.
- [x] Rodar lint local.
- [x] Rodar typecheck local.
- [x] Rodar testes unitarios locais.
- [x] Rodar build local.
- [x] Persistir orcamentos com item e snapshot de calculo.
- [x] Criar migration para permitir insert de auditoria por tenant.
- [x] Criar cadastro/listagem inicial de clientes.
- [x] Criar tela inicial de orcamentos.
- [x] Conectar precificador autenticado aos canais do tenant.
- [x] Adicionar dominio testado de snapshots/transicoes de orcamento.
- [x] Criar CRUD inicial de produtos.
- [x] Criar cadastro inicial de variantes.
- [x] Criar cadastro inicial de curvas por ancoragem.
- [x] Criar edicao inicial de ancoragens/curvas.
- [x] Criar CRUD inicial de plataformas/canais.
- [x] Corrigir template SQL do seed admin.
- [ ] Criar CRUD de curvas.
- [x] Criar CRUD de clientes.
- [x] Criar CRUD inicial de embalagens.
- [x] Criar script para importar `boxes.csv` para o banco.
- [x] Criar endpoint de estimativa de embalagem.
- [x] Reimplementar adapter Correios na nova arquitetura.
- [x] Criar endpoint autenticado de cotacao Correios.
- [x] Criar tela inicial de cotacao de frete.
- [x] Criar script para configurar credenciais Correios por tenant.
- [x] Criar adapter Melhor Envio.
- [x] Criar configuracao Melhor Envio por tenant.
- [x] Criar API de autenticacao OAuth URL/refresh para Melhor Envio.
- [x] Criar API de cotacao Melhor Envio.
- [x] Criar APIs proxy para carrinho, checkout, geracao, impressao e rastreio Melhor Envio.
- [x] Criar migration de shipments vinculados a orcamentos.
- [x] Criar pagina de detalhe do orcamento.
- [x] Criar alteracao de status do orcamento.
- [x] Criar texto de WhatsApp do orcamento.
- [x] Criar vinculo inicial de envios/shipments ao orcamento.
- [x] Gerar PDF do orcamento pela nova arquitetura.
- [x] Criar acoes visuais de Melhor Envio por shipment no detalhe do orcamento.
- [x] Persistir payload/resposta/status das etapas Melhor Envio em shipments.
- [x] Criar migration de endereco completo para tenant e clientes.
- [x] Criar tela de configuracoes do tenant/remetente.
- [x] Ampliar cadastro de cliente com endereco completo.
- [x] Criar gerador de payload base Melhor Envio a partir do orcamento.
- [x] Criar teste TDD para payload base Melhor Envio.
- [x] Persistir snapshot de embalagem e cotacao selecionada no shipment.
- [x] Preencher `volumes` do payload Melhor Envio a partir do shipment.
- [x] Criar rota de payload guiado por shipment e operacao Melhor Envio.
- [x] Atualizar UI de shipment para preparar payload antes de executar cada operacao.
- [x] Criar fluxo guiado de compra/geracao/rastreio de etiqueta Melhor Envio no shipment.
- [x] Criar callback OAuth Melhor Envio com troca automatica de `code` por tokens.
- [x] Criar tela de configuracao/autorizacao OAuth Melhor Envio em `/settings`.
- [x] Persistir renovacao de access token Melhor Envio no banco.
- [x] Criar regras testadas de gestao de usuarios e roles.
- [x] Criar tela `/users` para membros multi-user por tenant.
- [x] Criar APIs para listar, criar, atualizar e remover membros do tenant.
- [x] Criar policy/funcoes para gestao de membros por `users:manage`.
- [x] Criar fluxo de convite com link e definicao de senha pelo usuario.
- [x] Criar pagina publica `/invite/[token]` para ativacao de acesso.
- [ ] Importar `boxes.csv` no banco do ambiente alvo.
- [ ] Configurar credenciais Correios no banco do ambiente alvo.
- [ ] Configurar credenciais Melhor Envio no banco do ambiente alvo.
- [ ] Integrar Olist.
- [ ] Integrar CRM.
- [ ] Criar auditoria em todas as escritas.
- [ ] Criar testes e2e com Playwright.
- [ ] Revisar `npm audit` e atualizar dependencias vulneraveis sem quebrar Next/Vitest.

## Validacao Local

Ultima validacao executada:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Resultado:

- lint passou;
- typecheck passou;
- testes passaram: 33 testes em 13 arquivos;
- build Next passou.

## Acoes Manuais Pendentes

Importar as caixas do `boxes.csv` para o tenant `ground-shop`:

```bash
npm run import:boxes -- ground-shop boxes.csv
```

Esse comando usa `DATABASE_URL` e `DATABASE_SSL` do `.env`.

Configurar credenciais Correios para o tenant `ground-shop`:

```bash
npm run configure:correios -- ground-shop 'TOKEN_CORREIOS' 'CONTRATO_CORREIOS'
```

Depois disso a tela `/shipping` consegue cotar SEDEX/PAC usando as embalagens cadastradas/importadas.

Configurar Melhor Envio pelo fluxo OAuth em `/settings`. Cadastre no app do Melhor Envio o callback `${APP_URL}/api/melhor-envio/oauth/callback`, salve Client ID/Secret na tela e autorize o aplicativo.

Ponto de atencao:

- `npm install` reportou 7 vulnerabilidades transitivas no audit. Nao rodei `npm audit fix --force` porque ele pode aplicar breaking changes. Isso deve ser tratado em uma etapa propria de hardening.

## Migrations Criadas

1. `supabase/migrations/0001_multitenant_core.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_seed_ground_shop.sql`
4. `supabase/migrations/0004_tenant_profile_integrations.sql`
5. `supabase/migrations/0005_audit_log_insert_policy.sql`
6. `supabase/migrations/0006_shipments.sql`
7. `supabase/migrations/0007_addresses.sql`
8. `supabase/migrations/0008_shipment_packaging_snapshot.sql`
9. `supabase/migrations/0009_oauth_states.sql`
10. `supabase/migrations/0010_user_management_policies.sql`
11. `supabase/migrations/0011_user_invites.sql`

## Execucao Recomendada no Supabase

1. Rode `0001_multitenant_core.sql`.
2. Rode `0002_rls_policies.sql`.
3. Rode `0003_seed_ground_shop.sql`.
4. Rode `0004_tenant_profile_integrations.sql`.
5. Rode `0005_audit_log_insert_policy.sql`.
6. Rode `0006_shipments.sql`.
7. Rode `0007_addresses.sql`.
8. Rode `0008_shipment_packaging_snapshot.sql`.
9. Rode `0009_oauth_states.sql`.
10. Rode `0010_user_management_policies.sql`.
11. Rode `0011_user_invites.sql`.
12. Gere o hash de senha:

```bash
node scripts/hash-password.mjs 'SUA_SENHA_FORTE'
```

13. Copie `supabase/seed-admin.example.sql`, substitua email, nome e hash, e rode no SQL Editor.

## Observacoes

- O demo usa apenas dados ficticios.
- A area autenticada ja espera dados no Supabase.
- As curvas reais ja ficam no banco depois da migration de seed.
- A primeira versao do precificador autenticado carrega produtos e curvas do tenant.
