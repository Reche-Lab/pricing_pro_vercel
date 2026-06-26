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
- [ ] Criar CRUD de produtos.
- [ ] Criar CRUD de curvas.
- [ ] Criar CRUD de clientes.
- [ ] Migrar caixas do CSV para seed completa.
- [ ] Reimplementar Correios na nova arquitetura.
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
- testes passaram: 16 testes em 5 arquivos;
- build Next passou.

Ponto de atencao:

- `npm install` reportou 7 vulnerabilidades transitivas no audit. Nao rodei `npm audit fix --force` porque ele pode aplicar breaking changes. Isso deve ser tratado em uma etapa propria de hardening.

## Migrations Criadas

1. `supabase/migrations/0001_multitenant_core.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_seed_ground_shop.sql`
4. `supabase/migrations/0004_tenant_profile_integrations.sql`
5. `supabase/migrations/0005_audit_log_insert_policy.sql`

## Execucao Recomendada no Supabase

1. Rode `0001_multitenant_core.sql`.
2. Rode `0002_rls_policies.sql`.
3. Rode `0003_seed_ground_shop.sql`.
4. Rode `0004_tenant_profile_integrations.sql`.
5. Rode `0005_audit_log_insert_policy.sql`.
6. Gere o hash de senha:

```bash
node scripts/hash-password.mjs 'SUA_SENHA_FORTE'
```

7. Copie `supabase/seed-admin.example.sql`, substitua email, nome e hash, e rode no SQL Editor.

## Observacoes

- O demo usa apenas dados ficticios.
- A area autenticada ja espera dados no Supabase.
- As curvas reais ja ficam no banco depois da migration de seed.
- A primeira versao do precificador autenticado carrega produtos e curvas do tenant.
