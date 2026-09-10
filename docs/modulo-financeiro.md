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
GET|POST /api/finance/indicators?competence=AAAA-MM
PATCH|DELETE /api/finance/indicators/:indicatorId
POST     /api/finance/indicators/preview
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

Também inclui a aba `Indicadores`, com valor final, versão da fórmula, situação da competência e a
memória de cálculo de cada componente.

Os campos são preenchidos com os dados classificados e com a linha bruta importada sempre que disponíveis.
Valores sem classificação aparecem como `A classificar`, e as colunas calculadas são entregues com fórmula e
resultado armazenado no arquivo.

## Resultado operacional e indicadores personalizados

A visão geral apresenta a igualdade auditável `Entradas operacionais - Saídas operacionais = Resultado operacional`.
Cada parcela abre os lançamentos que formaram o valor, usando o marcador `include_operating_result` já mantido pela
classificação financeira.

Indicadores personalizados são exclusivos do tenant e usam uma fórmula estruturada. Cada componente pode:

- somar, subtrair, calcular média ou contar lançamentos;
- filtrar por direção, natureza, categoria/subcategoria, conta, origem e situação da revisão;
- usar valor absoluto ou manter o sinal original;
- incluir transferências internas somente quando isso for escolhido explicitamente.

Não são aceitos SQL, JavaScript ou expressões livres. Toda referência de conta, categoria e natureza é validada no
tenant antes da prévia e do salvamento. Alterações criam uma nova versão válida a partir da competência escolhida.
Ao concluir uma competência, o resultado e a memória de cálculo são congelados em
`financial_indicator_results`; reabrir a competência volta a mostrar a prévia atual e um novo fechamento recalcula
o snapshot com auditoria.

Exemplo para a Ground Shop: crie um indicador monetário `Base de comissão`, adicione `Vendas` filtrando a categoria
de vendas e acrescente `Fretes` com a operação `Subtrair` e a categoria de frete. A prévia mostra o resultado e a
quantidade de lançamentos antes do salvamento.

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

## Extrato bancário e fatura de cartão

Migration necessária: `0065_credit_card_statements.sql`, após as migrations anteriores.
Não são necessárias novas variáveis de ambiente. O Financeiro continua restrito aos administradores.

1. Em **Contas**, cadastre a conta bancária e outra conta do tipo **Cartão de crédito**. Para finanças
   pessoais, selecione a titularidade **Pessoal**. Cada tenant mantém suas próprias contas e regras.
2. Selecione a competência do vencimento. Em **Importações**, envie os CSVs do extrato e da fatura.
   O formato Nubank `date,title,amount` é detectado automaticamente; confirme o cartão e o vencimento
   sugerido pelo nome do arquivo. O nome do arquivo não é uma fonte definitiva da data de vencimento.
3. Confira a prévia e confirme cada importação. As datas originais das compras são preservadas,
   mas a competência dos lançamentos do cartão é a do vencimento informado.
4. Em **Lançamentos**, classifique compras e estornos, individualmente ou em lote. Em **Regras**,
   é possível filtrar pela conta do cartão para não aplicar a regra às outras contas.
   O atalho de criar regra durante a classificação fica restrito à conta dos lançamentos selecionados;
   seleções de várias contas precisam de uma regra criada explicitamente na aba Regras.
5. Em **Faturas**, confira as sugestões e selecione o débito bancário que pagou a fatura.
   O vínculo só é gravado após confirmação no modal e pode ser desfeito com auditoria.

Tratamento dos valores:

- Compras do cartão entram como despesas; estornos entram como créditos, sem movimentar o caixa bancário.
- O `Pagamento recebido` da fatura é informativo. Pode se referir à fatura anterior e não reduz as compras
  da fatura atual. Não é conciliado automaticamente com o extrato.
- Débitos identificados como `Pagamento de fatura` movimentam o caixa, mas não entram novamente no resultado.
  Um débito com outra descrição recebe esse tratamento ao ser vinculado manualmente.
- O total da fatura é a soma das compras menos estornos do CSV, excluindo pagamentos recebidos. Ele não
  substitui o saldo oficial do banco quando há saldo anterior, financiamento ou ajustes ausentes do CSV.
- Sugestões exigem mesma moeda, diferença de até um centavo e distância de até dez dias do vencimento.
  Vários candidatos podem aparecer; nenhum é escolhido automaticamente. Diferenças nunca são zeradas
  silenciosamente. Também é possível selecionar outro débito na janela de datas apresentada.
- Vários débitos podem pagar uma fatura parcialmente. Um débito não pode ser usado em duas faturas.
- Compras idênticas em linhas distintas são preservadas. O mesmo arquivo é deduplicado por checksum;
  uma segunda versão de fatura para o mesmo cartão/vencimento é bloqueada para evitar duplicidade.
- Não há reconstrução automática de parcelas futuras: cada parcela exportada pelo banco é um lançamento.
- Regras e classificações não podem fazer lançamentos do cartão movimentarem o caixa nem fazer pagamentos
  de fatura entrarem novamente no resultado. Essas proteções também existem no banco.
- Competências concluídas precisam ser reabertas para importar ou alterar vínculos de pagamento.

Outros layouts podem usar o mapeamento CSV com **Fatura de outro cartão**, desde que compras estejam
positivas e estornos/pagamentos negativos no arquivo. A nomenclatura de pagamentos de outros bancos
precisa ser homologada antes de usá-los. Não há importação de PDF, OCR ou conexão direta ao banco nesta etapa.

Novos endpoints autenticados: `GET /api/finance/cards?competence=AAAA-MM` e `PATCH /api/finance/cards`
com `{ statementId, transactionId, action: "link" | "unlink" }`. IDs são validados no tenant da sessão.

### Checklist deste bloco

- [x] Conta de cartão separada da conta bancária, incluindo titularidade pessoal.
- [x] Naturezas padrão também inicializadas ao cadastrar contas em tenants criados depois das migrations.
- [x] Detecção de fatura Nubank, prévia e confirmação de vencimento.
- [x] Identificação de compras, estornos e pagamentos por lançamento.
- [x] Reutilização de categorias, naturezas e regras por tenant/conta.
- [x] Atalho de regras restrito à conta selecionada, sem sobrescrever regras de outro escopo.
- [x] Vínculo de pagamento sugerido por data/valor, confirmação, saldo e desvinculação auditada.
- [x] Proteção de caixa/resultado contra dupla contagem, inclusive após reclassificação.
- [x] Testes de domínio e banco isolado, incluindo compras repetidas e isolamento entre tenants.
- [x] Fluxo no navegador em 1440, 390 e 320 px: cadastro, upload, prévia, confirmação, persistência e desvinculação.
- [ ] Aplicar migration e homologar os arquivos no tenant de destino (ação do administrador).

Testes locais: `src/tests/unit/card-statements.test.ts`,
`src/tests/integration/finance-cards-database.test.ts` (exige `FINANCE_TEST_DATABASE_URL` local),
`src/tests/integration/finance-cards-files.test.ts` (fixtures privadas opcionais via
`FINANCE_CARD_SAMPLE` e `FINANCE_BANK_SAMPLE`) e `scripts/finance-cards-browser.mjs`.
O teste de navegador exige Playwright disponível via `FINANCE_PLAYWRIGHT_PATH`, banco local isolado
`commerce_test_*` e servidor em `FINANCE_TEST_BASE_URL`; usa somente CSVs fictícios.

Validação deste bloco: 313 testes passaram na suíte local (11 condicionais ignorados); o teste com os
dois arquivos privados fornecidos passou separadamente, sem importá-los no banco. Build de produção,
checagem TypeScript, lint e fluxo no navegador também concluídos. Nenhuma migration foi aplicada ao
Supabase remoto durante o desenvolvimento.

## Limites e próximas fases

- O arquivo PayPal real ainda não foi fornecido; o adapter precisa ser homologado com a exportação real antes de uso produtivo.
- Sugestões por IA/OpenRouter, recorrência e anomalias não foram ligadas nesta fase. O motor determinístico funciona sem IA.
- A tela usa tabela paginável pelo navegador; virtualização/job assíncrono será necessária para arquivos acima do limite atual de 10 MB.
- Exportação PDF gerencial e gráficos históricos de 3, 6 e 12 meses ficam para a próxima etapa; CSV e Excel já usam as mesmas métricas do dashboard.
- Escrita/baixa no Olist permanece desativada por segurança.
- Exclusão controlada de lote e política configurável de retenção ainda precisam de UI administrativa.
