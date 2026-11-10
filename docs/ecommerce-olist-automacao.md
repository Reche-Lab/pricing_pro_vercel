# Pedidos da loja e Olist

## Planejado x realizado

- [x] Integração opcional, desativada por padrão, disponível somente com Olist cadastrado no tenant.
- [x] Configuração em Loja online > Olist, exclusiva de owner/admin/superadmin do tenant ativo.
- [x] Correspondência explícita para formas de recebimento Pix, cartão, pagamento manual e categoria financeira.
- [x] Confirmação real de pagamento grava uma entrada de fila na mesma transação (webhook, checkout transparente e confirmação manual).
- [x] Cadastro/vínculo do cliente por CPF/CNPJ exato, sem associação automática por nome e sem sobrescrever cadastros globais.
- [x] Pedido de venda com IDs Olist dos produtos, quantidades, artes, valores congelados, benefício por arte, frete e destinatário.
- [x] Produção e aprovação de artes continuam internas; conclusão explícita da produção libera faturamento.
- [x] Conferência da embalagem, peso e transporte antes de gerar a nota.
- [x] Geração e autorização fiscal separadas, somente com pagamento de produção confirmado.
- [x] Solicitação de e-mail pelo serviço Olist (`enviarEmail`), com validação do destinatário da nota.
- [x] Consulta da autorização quando pendente, sem repetir autorização/e-mail em cada consulta.
- [x] Criação efetiva do agrupamento de expedição a partir da NF-e autorizada, exceto retirada.
- [x] Atualização idempotente de código/URL de rastreio no pedido e na nota pela equipe.
- [x] Etapas, IDs externos, falhas humanizadas e referência de diagnóstico persistidos no pedido.
- [x] Reconexão OAuth em modal, sem sair do pedido, e retomada explícita após autorização.
- [x] Fila durável, leases compatíveis com pooler transacional do Supabase e reconciliação antes de recriar registros.
- [x] Pedidos de teste, excluídos e estornados não iniciam novas operações no ERP.
- [x] Testes de domínio, componentes, permissões e Postgres isolado; revisão Playwright em 1440/390/320 px, sem chamadas reais ao ERP.
- [ ] Aplicar a migration 0074 no Supabase correto antes do deploy.
- [ ] Configurar CRON_SECRET e agendador; ativar e homologar a integração no tenant-piloto.

## Ativação

1. Execute `supabase/migrations/0074_commerce_olist_automation.sql` depois das migrations anteriores.
2. Em Configurações > Geral > Olist e CRM, conecte a conta correta. Permita leitura/escrita de Contatos, Pedidos e Notas Fiscais e leitura/escrita de Expedição; permita leitura de Formas de recebimento e Categorias. Alterações de permissão exigem nova autorização OAuth.
3. Confira os IDs Olist dos produtos em Produtos. SKU, mesmo numérico, não será tratado como ID nesta automação.
4. Configure as correspondências de envio/SEDEX/PAC na integração Olist e confira pesos, dimensões e caixas.
5. Em Loja online > Olist, sincronize as opções de recebimento, escolha as correspondências e ative a automação. Não use formas que gerem uma nova cobrança para valores já recebidos na loja.
6. Mantenha certificado, natureza de operação, tributação dos produtos e ambiente fiscal configurados no ERP. Valide essas regras com a contabilidade.
7. Configure um `CRON_SECRET` aleatório de ao menos 32 caracteres na Vercel e no ambiente local. Exemplo de geração: `openssl rand -hex 32`. Nunca use tokens Olist ou chaves de compradores como segredo do agendador.
8. Configure um agendador confiável para chamar, a cada minuto, `GET https://SEU_APP_URL/api/cron/commerce-olist`, com `Authorization: Bearer SEU_CRON_SECRET`. Não coloque o segredo na URL. O endpoint processa um pedido por chamada, com limite de etapas; ajuste a frequência se houver fila. Pode usar Vercel Cron se o plano permitir, enviando `CRON_SECRET` conforme a documentação da Vercel, ou um agendador externo autenticado. Nenhum cron foi ativado automaticamente nesta entrega.

Localmente, `npm run commerce:olist:worker` consulta esse endpoint a cada minuto usando `.env`. Exige o servidor Next rodando. Esse comando é auxiliar, não deve depender de um computador pessoal para automação em produção.

A confirmação do pagamento e a conclusão da produção também iniciam um processamento pós-resposta via `next/server.after`. O agendador continua necessário para retomar falhas, processar a fila restante e consultar autorizações assíncronas mesmo quando ninguém estiver com a página aberta.

Ativar não importa pedidos históricos. Abra um pedido pago anterior e use **Sincronizar este pedido** se desejar enviá-lo ao ERP.

## Fluxo operacional

`Pagamento confirmado → cliente → pedido de venda → aguardar produção → concluir produção → transporte/volumes → gerar NF-e → autorizar e solicitar e-mail → conferir autorização → expedição`

O pedido conserva preços e descontos da compra; não usa a curva atual. Quando um total não é divisível pela quantidade em centavos, a linha é desdobrada em duas faixas de preço centesimal para manter exatamente quantidade e total pago. O benefício de arte é enviado uma única vez como desconto do pedido.

O nome/documento/endereço de faturamento não se confundem com a identidade de login. A entrega pode ter outro destinatário e A/C. Contatos já existentes são reutilizados por documento, não alterados silenciosamente. Se o e-mail da nota divergir do faturamento, corrija-o no Olist antes de autorizar e retome a etapa.

No pedido, **Concluir produção** exige pagamento real, produção iniciada e artes aprovadas, quando houver. A embalagem calculada fica congelada para faturamento. A alteração de etapa para enviado exige NF-e autorizada e expedição quando essas automações estiverem habilitadas. Gerar nota não significa autorização: estados rejeitado, cancelado ou denegado não liberam expedição. Olist HTTP 200 não significa que o e-mail foi entregue.

As opções de desativar faturamento/expedição automática permitem operação externa ao módulo; não criam um fluxo manual fiscal alternativo dentro da loja. Reativação e **Conferir e retomar** aproveitam os registros já encontrados no ERP.

## Segurança e recuperação

- O backend resolve tenant e permissões da sessão administrativa; o comprador não chama mutações do ERP.
- Sem credenciais em navegador, resposta, snapshot do comprador ou log novo da automação. O worker aceita apenas o host oficial API v3 e renovação no OAuth oficial.
- Leases de curta duração serializam operações por pedido e cadastro por documento/tenant. Não dependem de locks de sessão PostgreSQL, portanto funcionam com Supabase transaction pooling.
- Cada criação registra uma intenção antes da chamada. Timeout, resposta sem ID ou falha ao persistir retorno bloqueiam repetição cega. A retomada consulta documento, referência do e-commerce, nota vinculada e expedição existente antes de continuar.
- Uma intenção cujo registro ainda não é encontrado permanece **Revisão necessária**. Não limpe marcadores ou envie POST novamente sem conferência técnica: o ERP pode ter executado a operação sem a resposta ter chegado.
- Falhas de consulta e respostas temporárias rejeitadas são retomadas pelo agendador; falhas de dados/permissão exigem correção. `invalid_grant` preserva progresso e oferece reconexão.
- Estorno ou exclusão administrativa interrompe novas etapas; não cancela documentos, pagamentos ou expedições já criados. Uma chamada externa já em andamento pode terminar: sua referência deve ser revisada antes de estornar/cancelar.
- Não damos baixa financeira, não lançamos contas/estoque em duplicidade e não compramos etiquetas neste módulo. Configurações automáticas do próprio ERP devem ser revisadas para evitar duplicidade financeira. A emissão de etiquetas da loja e a integração automática com seu rastreio continuam uma entrega própria; nesta entrega o rastreio pode ser informado pela equipe.
- O agrupamento é criado em `/expedicao`; não concluímos automaticamente o despacho físico nem utilizamos One Step Shipping, evitando compra/postagem involuntária.

## Verificação local

- Todas as 74 migrations aplicadas em banco local vazio, sem usar o projeto Supabase real.
- Suíte geral aprovada: 737 testes na rodada completa; depois dos últimos ajustes, 23 testes focados aprovados (incluindo o caso adicional de identidade de faturamento).
- Regressão de banco: 25 testes existentes de loja/campanhas aprovados e 12 novos cenários Olist aprovados, incluindo concorrência, resultado incerto, OAuth, e-mail divergente e desativação da integração.
- TypeScript, ESLint e build Next aprovados, com memória limitada e build de uma CPU.
- Playwright/Chrome em 1440, 390 e 320 px: configurações, pedido, liberação fiscal, modal, motivo obrigatório, erro dentro do modal e ausência de overflow horizontal. Mutações do teste visual interceptadas; nenhum serviço ERP, pagamento, e-mail ou Storage real foi acionado.

Para repetir a integração, crie um banco local novo com `scripts/setup-commerce-test.mjs`, configure `COMMERCE_TEST_DATABASE_URL` e execute `npm run test:local -- src/tests/integration/commerce-olist-database.test.ts`. O script e a suíte recusam bancos remotos e nomes fora de `commerce_test_*`.

## Referências oficiais

- [Criar pedido](https://api-docs.erp.olist.com/api-reference/pedidos/criar-pedido)
- [Gerar nota fiscal do pedido](https://api-docs.erp.olist.com/api-reference/pedidos/gerar-nota-fiscal-do-pedido)
- [Autorizar nota fiscal e solicitar e-mail](https://api-docs.erp.olist.com/api-reference/notas/autorizar-nota-fiscal)
- [Criar agrupamento de expedição](https://api-docs.erp.olist.com/api-reference/expedi%C3%A7%C3%A3o/criar-agrupamento-de-expedi%C3%A7%C3%A3o)
- [Configuração do envio de documentos pelo Olist](https://ajuda.olist.com/pedidos/configuracoes-do-envio-de-documentos)
