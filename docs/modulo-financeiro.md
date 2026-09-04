# Módulo Financeiro Multi-tenant

## Diagnóstico da arquitetura

- Frontend e backend: Next.js 15, React 19, App Router e TypeScript estrito.
- Banco: PostgreSQL/Supabase acessado por `pg`.
- Tenant: a sessão possui `userId` e `tenantId`; `withTenantContext` configura `app.user_id` e `app.tenant_id` dentro de uma transação.
- Segurança: permissões por papel, RLS, filtros explícitos por `tenant_id`, auditoria e credenciais criptografadas por tenant.
- Integrações: serviços isolados por provedor, OAuth Olist e logs estruturados.
- UI: Tailwind, tema escuro, `AppShell` e menu lateral responsivo.

O módulo financeiro segue esses padrões e não reutiliza pagamentos de orçamento como lançamentos bancários. Os dois conceitos podem ser conciliados futuramente, mas mantêm origens e ciclos de vida diferentes.

## Arquitetura implementada

```text
CSV original
  -> parser RFC/BOM/delimitador
  -> detecção por confiança
  -> adapter da instituição
  -> estrutura canônica em centavos
  -> validação e prévia
  -> transação PostgreSQL
       -> lote + arquivo original
       -> linhas brutas imutáveis
       -> lançamentos normalizados
       -> regras determinísticas do tenant
       -> sugestões/pares de transferência
  -> dashboard, revisão, fechamento e exportação
  -> Olist read-only (opcional)
```

Camadas:

- `src/domain/finance`: parser, adapters, classificação, métricas e transferências sem dependência de UI ou banco.
- `src/repositories/finance.ts`: persistência transacional e consultas sempre limitadas pelo tenant.
- `src/services/finance`: exportação e providers externos.
- `src/app/api/finance`: autenticação, autorização, validação e logs.
- `src/components/finance`: experiência de importação, revisão e relatórios.

## Migration

Rode no SQL Editor do Supabase:

```text
supabase/migrations/0054_financial_statements.sql
supabase/migrations/0055_finance_admin_only.sql
supabase/migrations/0056_financial_natures.sql
```

Ela cria:

- permissões `finance:*` e papel `finance`;
- `financial_accounts`;
- `financial_months`;
- `bank_statement_imports`;
- `bank_statement_raw_rows`;
- `financial_transactions`;
- `financial_categories`;
- `financial_classification_rules`;
- `internal_transfer_matches`;
- `olist_financial_matches`;
- `financial_audit_logs`;
- índices e políticas RLS;
- categorias e regras exclusivas da Ground Shop, vinculadas pelo slug `ground-shop`.

A migration `0055` restringe temporariamente toda visualização e operação financeira aos papéis `owner` e `admin`, além do superadmin. O backend repete essa verificação em todas as APIs; ocultar o menu não é a única barreira de acesso.

Não há nova variável de ambiente. O arquivo original é preservado em `bytea`, dentro do banco e protegido por RLS. Isso evita exigir um bucket adicional nesta fase e mantém download autenticado por `/api/finance/imports/:id/file`.

## Uso mensal

1. Acesse `/finance` e abra `Contas`.
2. Cadastre cada conta e informe se integra o caixa operacional e se é obrigatória para fechamento.
3. Selecione a competência.
4. Em `Importações`, selecione a conta e arraste um ou mais CSVs.
5. Confira instituição, linhas, entradas, saídas, saldo e avisos.
6. Para CSV desconhecido, relacione data, descrição, valor e identificador.
7. Confirme a importação.
8. Revise `Lançamentos`, classifique em lote e opcionalmente crie uma regra futura.
9. Em `Categorias`, crie e mantenha categorias e subcategorias de receita, despesa ou movimentação neutra.
10. Em `Naturezas`, mantenha os significados gerenciais e seus comportamentos padrão no fluxo de caixa e resultado operacional.
11. Confirme ou rejeite transferências que exigem revisão.
12. Exporte CSV/Excel e conclua a competência. Pendências exigem justificativa.

Categorias excluídas são desativadas, não removidas fisicamente. Elas deixam de ser oferecidas para novas classificações, suas regras automáticas são desativadas e os lançamentos históricos continuam identificados corretamente.

Naturezas também usam exclusão lógica. `Não classificado`, `Transferência interna` e `Informativo` são protegidas porque participam do processamento automático; podem ter nome e padrões ajustados, mas não podem ser excluídas.

O checksum impede a duplicação do mesmo arquivo. Os hashes e identificadores de origem preservam a rastreabilidade por linha.

## Adapters

Implementados:

- Nubank;
- Olist Conta Digital;
- Mercado Pago, incluindo cabeçalho de saldo;
- PayPal preparado para cabeçalhos em português ou inglês;
- CSV genérico com mapeamento manual.

Para adicionar um banco:

1. Implemente `BankStatementAdapter` em `src/domain/finance/adapters.ts`.
2. Retorne confiança de `0` a `1` em `canHandle`.
3. Normalize sempre valor em centavos, direção pelo sinal e data ISO.
4. Preserve todo conteúdo da linha em `rawData`.
5. Registre o adapter em `statementAdapters` antes do genérico.
6. Adicione testes com BOM, delimitador, decimal, datas, saldo e arquivo inválido.

## Olist

Matriz atualmente habilitada:

| Capacidade | API oficial v3 | Estado no Pricing Pro |
|---|---|---|
| Consultar contas a receber | `GET /contas-receber` | Leitura habilitada |
| Consultar contas a pagar | `GET /contas-pagar` | Leitura habilitada |
| Sugerir correspondência | Cálculo interno | Habilitado |
| Criar conta a receber/pagar | API disponível | Desabilitado |
| Baixar conta | API disponível | Desabilitado |
| Criar transferência própria | Não confirmado como operação única | Desabilitado |

Fontes oficiais consultadas: [índice da API v3](https://api-docs.erp.olist.com/llms.txt), [contas a receber](https://api-docs.erp.olist.com/api-reference/contas-a-receber/listar-contas-a-receber), [contas a pagar](https://api-docs.erp.olist.com/api-reference/contas-a-pagar/listar-contas-a-pagar).

Em `/finance`, a aba `Conciliação Olist` é somente leitura. O módulo funciona normalmente sem Olist. Escrita exigirá preview, confirmação, conta/categoria, chave de idempotência e auditoria antes de ser habilitada.

### Permissões financeiras do Olist

O Olist controla o acesso por módulo. Um token válido pode consultar contatos e pedidos e ainda receber `403` nos endpoints financeiros. Para habilitar a conciliação:

1. No Olist ERP, acesse `Configurações > Geral > Aplicativos` e abra o aplicativo usado pelo Pricing Pro.
2. Libere a permissão `Consultar` nos módulos `Contas a Receber` e `Contas a Pagar`.
3. Confirme que o usuário que autoriza o aplicativo também possui acesso a esses módulos.
4. Salve as permissões, gere um novo `Client Secret` e atualize-o em `Configurações > Geral > Olist e CRM` no Pricing Pro.
5. Clique em `Conectar Olist` novamente para emitir tokens com a configuração atualizada.

A consulta usa paginação de 100 registros por chamada, conforme o contrato oficial, e diagnostica cada módulo separadamente. Um módulo autorizado continua disponível mesmo quando o outro retorna `401` ou `403`.

Referência: [configuração e permissões de aplicativos API v3](https://ajuda.olist.com/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao) e [autenticação OAuth](https://api-docs.erp.olist.com/documentacao/comecando/autenticacao).

## Endpoints

```text
GET|POST /api/finance/accounts
POST     /api/finance/imports
GET      /api/finance/imports/:importId/file
GET      /api/finance/overview?competence=AAAA-MM
GET      /api/finance/comparison?competence=AAAA-MM&months=3|6|12
PATCH    /api/finance/transactions
PATCH    /api/finance/transfers/:matchId
GET|POST /api/finance/rules
PATCH|DELETE /api/finance/rules/:ruleId
POST     /api/finance/rules/simulate
POST     /api/finance/rules/:ruleId/apply
POST     /api/finance/month
GET      /api/finance/export?competence=AAAA-MM&format=csv|xlsx
GET      /api/finance/olist/search?competence=AAAA-MM
```

O Excel inclui duas visões dos lançamentos:

- `Lancamentos`: modelo detalhado de 24 colunas, com UID, origem, linha do extrato, identificador original,
  natureza, categoria/subcategoria, indicadores de inclusão, observação e fórmulas de fluxo e resultado;
- `Lancamentos_Resumo`: visão compacta preservada para leitura rápida.

Os campos são preenchidos com os dados classificados e com a linha bruta importada sempre que disponíveis.
Valores sem classificação aparecem como `A classificar`, e as colunas calculadas são entregues com fórmula e
resultado armazenado no arquivo.

## Teste de regressão Ground Shop

Com os três arquivos de julho de 2026:

```text
Linhas normalizadas: 86
Linhas informativas: 1
Entradas externas: R$ 2.830,34
Saídas externas: R$ 2.020,29
Fluxo líquido externo: R$ 810,05
Transferências internas excluídas: R$ 826,17
Saldo final Mercado Pago: R$ 27,84
```

O teste comprova que `Saldo de fechamento` não é receita e que pares de alta confiança entre contas empresariais não inflam o consolidado.

## Limites e próximas fases

- O arquivo PayPal real ainda não foi fornecido; o adapter precisa ser homologado com a exportação real antes de uso produtivo.
- Sugestões por IA/OpenRouter, recorrência e anomalias não foram ligadas nesta fase. O motor determinístico funciona sem IA.
- A tela usa tabela paginável pelo navegador; virtualização/job assíncrono será necessária para arquivos acima do limite atual de 10 MB.
- Exportação PDF gerencial e gráficos históricos de 3, 6 e 12 meses ficam para a próxima etapa; CSV e Excel já usam as mesmas métricas do dashboard.
- Escrita/baixa no Olist permanece desativada por segurança.
- Exclusão controlada de lote e política configurável de retenção ainda precisam de UI administrativa.
