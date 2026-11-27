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
- [x] Vercel Schedule `commerce-olist`, com função privada, execução a cada minuto e deduplicação por executionId.
- [x] Pedidos de teste, excluídos e estornados não iniciam novas operações no ERP.
- [x] Testes de domínio, componentes, permissões e Postgres isolado; revisão Playwright em 1440/390/320 px, sem chamadas reais ao ERP.
- [ ] Aplicar a migration 0074 no Supabase correto antes do deploy.
- [ ] Fazer deploy da configuração de Schedules e conferir o primeiro processamento em produção; ativar e homologar a integração no tenant-piloto.

## Ativação

1. Execute `supabase/migrations/0074_commerce_olist_automation.sql` depois das migrations anteriores.
2. Em Configurações > Geral > Olist e CRM, conecte a conta correta. Permita leitura/escrita de Contatos, Pedidos e Notas Fiscais e leitura/escrita de Expedição; permita leitura de Formas de recebimento e Categorias. Alterações de permissão exigem nova autorização OAuth.
3. Confira os IDs Olist dos produtos em Produtos. SKU, mesmo numérico, não será tratado como ID nesta automação.
4. Configure as correspondências de envio/SEDEX/PAC na integração Olist e confira pesos, dimensões e caixas.
5. Em Loja online > Olist, sincronize as opções de recebimento, escolha as correspondências e ative a automação. Não use formas que gerem uma nova cobrança para valores já recebidos na loja.
6. Mantenha certificado, natureza de operação, tributação dos produtos e ambiente fiscal configurados no ERP. Valide essas regras com a contabilidade.
7. Publique o `vercel.json` desta entrega no projeto `brunos-projects-1302295e/liaflow-calcula`. Ele declara o schedule estático **commerce-olist**, a cada minuto, com timezone `America/Sao_Paulo` e jitter de um minuto. A equipe foi consultada pela CLI e está no plano Pro. Em uma transferência futura para Hobby, altere a expressão para `*/15 * * * *` e o jitter para `15` antes do deploy.
8. No painel do projeto, abra **Schedules** e confira o alvo privado **api/schedules/commerce-olist**. Novos schedules estáticos de produção começam ativos quando o deploy se torna atual; Preview começa inativo. O handler também bloqueia processamento de ERP fora de `VERCEL_ENV=production`.
9. Configure/homologue a integração do tenant antes de usar **Run Schedule**, pois essa ação processa a fila real. Confira o histórico e os logs pelo `executionId`. A ausência de pedidos elegíveis é um sucesso sem operação no ERP. O schedule não importa pedidos históricos automaticamente.
10. Desative eventuais agendadores externos antigos para esta mesma fila. Não cadastre simultaneamente uma entrada `crons` nem um schedule com `path`: o alvo principal é privado e não depende de `CRON_SECRET`.

Não foi feito deploy nem invocação de schedule em produção durante a configuração local. A declaração será registrada quando você publicar esta versão. Detalhes operacionais: `docs/vercel-schedules-olist.md`.

### Alternativa manual/externa

A rota `GET /api/cron/commerce-olist` continua protegida por `Authorization: Bearer CRON_SECRET`, para diagnóstico ou um ambiente fora da Vercel. Apenas nesse caso configure um segredo aleatório com 32+ caracteres, gerado por `openssl rand -hex 32`. Não use tokens Olist, não envie o segredo na URL e não mantenha esse agendador em paralelo ao Schedule privado.

Localmente, `npm run commerce:olist:worker` consulta a rota alternativa a cada minuto usando `.env` e exige `CRON_SECRET` e o servidor Next rodando. Esse comando é auxiliar, não deve depender de um computador pessoal para automação em produção.

A confirmação do pagamento e a conclusão da produção também iniciam um processamento pós-resposta via `next/server.after`. O agendador continua necessário para retomar falhas, processar a fila restante e consultar autorizações assíncronas mesmo quando ninguém estiver com a página aberta.

Ativar não importa pedidos históricos. Abra um pedido pago anterior e use **Sincronizar este pedido** se desejar enviá-lo ao ERP.

## Fluxo operacional

`Pagamento confirmado → cliente → pedido de venda → aguardar produção → concluir produção → transporte/volumes → gerar NF-e → autorizar e solicitar e-mail → conferir autorização → expedição`

O pedido conserva preços e descontos da compra; não usa a curva atual. Quando um total não é divisível pela quantidade em centavos, a linha é desdobrada em duas faixas de preço centesimal para manter exatamente quantidade e total pago. O benefício de arte é enviado uma única vez como desconto do pedido.

O nome/documento/endereço de faturamento não se confundem com a identidade de login. A entrega pode ter outro destinatário e A/C. Contatos já existentes são reutilizados por documento, não alterados silenciosamente. Se o e-mail da nota divergir do faturamento, use **Conferir e-mails da nota** para atualizar o cadastro com o e-mail da compra ou autorizar explicitamente os endereços já registrados no Olist.

No pedido, **Concluir produção** exige pagamento real, produção iniciada e artes aprovadas, quando houver. A embalagem calculada fica congelada para faturamento. A alteração de etapa para enviado exige NF-e autorizada e expedição quando essas automações estiverem habilitadas. Gerar nota não significa autorização: estados rejeitado, cancelado ou denegado não liberam expedição. Olist HTTP 200 não significa que o e-mail foi entregue.

As opções de desativar faturamento/expedição automática permitem operação externa ao módulo; não criam um fluxo manual fiscal alternativo dentro da loja. Reativação e **Conferir e retomar** aproveitam os registros já encontrados no ERP.

### Acompanhamento guiado pela equipe

O pedido administrativo reúne pagamento, aprovação das artes, produção, faturamento e envio em uma sequência única. O resumo superior destaca a etapa atual e apresenta somente a próxima ação operacional. PDFs de produção, nota autorizada, etiqueta e rastreio permanecem disponíveis como atalhos; IDs e diagnóstico do ERP ficam em **Integrações e detalhes · Olist**.

- **Iniciar produção** e **Concluir produção e liberar NF-e** continuam exigindo confirmação e observação. A conclusão no Olist é reaproveitada em Melhor Envio, sem uma segunda confirmação de produção.
- A autorização fiscal e a preparação da expedição aparecem como etapas automáticas. Não há botão para emitir uma segunda nota enquanto a primeira aguarda autorização.
- **Comprar etiqueta de envio** é uma cobrança separada do pagamento do comprador. O modal mantém a conferência do valor e a aceitação explícita de eventual diferença.
- Etiqueta gerada não confirma postagem. **Confirmar postagem** e **Confirmar retirada** representam a entrega física do pacote, não apenas a geração de um documento.
- Retirada e tenants sem automação Olist têm etapas adaptadas. Pedidos encerrados, estornados ou de teste não recebem uma próxima ação operacional. Leitores podem consultar e imprimir documentos, sem executar mutações administrativas.

Esta organização não altera os gates fiscais, permissões, reconciliação ou garantias contra cobranças e emissões duplicadas. Não requer migration adicional.

## Segurança e recuperação

- O backend resolve tenant e permissões da sessão administrativa; o comprador não chama mutações do ERP.
- Sem credenciais em navegador, resposta, snapshot do comprador ou log novo da automação. O worker aceita apenas o host oficial API v3 e renovação no OAuth oficial.
- Leases de curta duração serializam operações por pedido e cadastro por documento/tenant. Não dependem de locks de sessão PostgreSQL, portanto funcionam com Supabase transaction pooling.
- Cada criação registra uma intenção antes da chamada. Timeout, resposta sem ID ou falha ao persistir retorno bloqueiam repetição cega. A retomada consulta documento, referência do e-commerce, nota vinculada e expedição existente antes de continuar.
- Uma intenção cujo registro ainda não é encontrado permanece **Revisão necessária**. Não limpe marcadores ou envie POST novamente sem conferência técnica: o ERP pode ter executado a operação sem a resposta ter chegado.
- Falhas de consulta e respostas temporárias rejeitadas são retomadas pelo agendador; falhas de dados/permissão exigem correção. `invalid_grant` preserva progresso e oferece reconexão.
- A consulta de contatos compara o CPF/CNPJ normalizado, tenta também a versão formatada quando necessário e verifica a paginação. Se a listagem omitir o documento, consulta o detalhe antes de vincular. Formatos inesperados, resultados incompletos ou contatos ambíguos não liberam criação automática.
- Um conflito HTTP 409 com `idContatoExistente` permite recuperar o contato somente após consultar `/contatos/{id}` e confirmar o CPF/CNPJ de faturamento. Sem esse ID, a consulta por documento é repetida uma vez. O vínculo fica persistido por tenant/documento, sem sobrescrever o cadastro do ERP ou repetir a criação do pedido. Uma falha temporária nessa conferência não transforma uma criação explicitamente recusada em mutação incerta.
- Estorno ou exclusão administrativa interrompe novas etapas; não cancela documentos, pagamentos ou expedições já criados. Uma chamada externa já em andamento pode terminar: sua referência deve ser revisada antes de estornar/cancelar.
- Não damos baixa financeira, não lançamos contas/estoque em duplicidade e não compramos etiquetas neste módulo. Configurações automáticas do próprio ERP devem ser revisadas para evitar duplicidade financeira. A emissão de etiquetas da loja e a integração automática com seu rastreio continuam uma entrega própria; nesta entrega o rastreio pode ser informado pela equipe.
- O agrupamento é criado em `/expedicao`; não concluímos automaticamente o despacho físico nem utilizamos One Step Shipping, evitando compra/postagem involuntária.

### Retomar pedidos bloqueados por cliente já existente

Após publicar a correção, abra **Loja online > Pedidos**, selecione o pedido e use **Olist > Conferir e retomar**. O deploy não desbloqueia automaticamente pedidos que exigiam revisão. Não é necessário excluir o cliente, refazer o pagamento nem limpar IDs no banco.

O pedido de venda é criado após resolver o cliente. A geração e autorização da NF-e continuam dependendo de **Concluir produção** e das configurações de automação. A expedição depende da autorização fiscal e não se aplica à retirada.

Os logs `Commerce Olist customer lookup completed` informam formato de busca, paginação e contagens, sem CPF/CNPJ ou e-mail. `Commerce Olist customer resolved` registra o ID e a origem do vínculo (`saved_mapping`, `document_lookup`, `created` ou `verified_create_conflict`). Falhas do worker incluem tipo de erro e campos recusados pelo Olist.

### Mais de um cadastro para o mesmo CPF/CNPJ

Dois IDs diferentes com o mesmo documento interrompem a associação automática, não a consulta. O erro é `olist_customer_ambiguous`, com orientação específica; não é classificado como mutação incerta quando nenhuma criação foi tentada.

1. No pedido administrativo, abra **Integrações e detalhes · Olist > Conferir cliente Olist**. A ação fica disponível também quando o destaque superior estiver em outra etapa e para pedidos antigos com o erro genérico de revisão.
2. Confira os contatos retornados pelo CPF/CNPJ do faturamento: nome, ID, documento, e-mail, telefone e cidade. Nenhum contato vem pré-selecionado; inativos/excluídos não podem ser escolhidos.
3. Selecione o cadastro correto, informe o motivo e confirme **Vincular cliente e continuar**.

O backend consulta novamente `/contatos/{id}` e exige o documento exato e situação não inativa/excluída. O vínculo usa os mesmos leases do worker por pedido e por tenant/documento, revalida pagamento e progresso e grava o responsável/motivo no histórico. Não altera cadastros no ERP nem os dados congelados da compra. O mapeamento fica disponível para próximos pedidos desse documento no mesmo tenant.

A fila continua da etapa pendente, preservando as liberações de produção, nota e expedição e os marcadores de operações incertas. Um vínculo não pode substituir outro mapeamento confirmado ou modificar pedido de venda já criado. Sem candidatos, é possível consultar novamente ou usar **Conferir e retomar** após corrigir o cadastro. Erros permanecem no modal; OAuth inválido oferece reconexão.

Não há migration nova nem desbloqueio automático de pedidos existentes no deploy. A escolha do cadastro é explícita pela equipe. Testes usam banco local descartável e respostas Olist simuladas, sem emissão fiscal real.

### E-mail da compra diferente do cadastro Olist

O destinatário fiscal padrão é o e-mail de **faturamento congelado na compra**, não o login do comprador. O worker confere o cadastro antes de gerar a primeira nota e confere novamente o destinatário antes de autorizar. Uma divergência fica com código `olist_email_update_required` e oferece **Conferir e-mails da nota**, inclusive em pedidos com o erro genérico antigo. A equipe pode manter os endereços do ERP por confirmação explícita, conforme descrito abaixo.

1. Abra a ação no pedido administrativo. O modal consulta o contato vinculado e a nota pendente e compara e-mail da compra, e-mail geral do contato, e-mail de NF-e do contato e e-mail da nota.
2. Confirme a autorização de atualizar o cadastro compartilhado do ERP e informe o motivo. O navegador não escolhe nem envia um novo endereço: o servidor deriva o destino da compra e recusa campos extras.
3. O backend compara o estado atual com a conferência apresentada, registra intenção e valores anteriores cifrados e monta `PUT /contatos/{id}` com os campos graváveis do cadastro consultado no ERP, incluindo `nome` (exigido pelo Olist). Apenas `email` e `emailNfe` recebem os valores autorizados da compra. Nome, CPF/CNPJ, endereço e demais dados continuam sendo os do ERP, não os da compra. Vendedor e tipos são enviados no formato de IDs exigido pelo PUT; campos somente de leitura não são reenviados. Se o cadastro vier incompleto ou incompatível, nenhuma atualização é enviada e a equipe pode corrigir o cadastro ou manter os e-mails do Olist.
4. Uma nova leitura verifica o resultado. Apenas se cadastro e nota tiverem o destinatário correto a fila retoma a nota existente. A autorização e o envio por e-mail seguem as configurações do tenant.

Na atualização de e-mail, `regimeTributario`, `estadoCivil` e `sexo` aceitam representações vazias legadas (`""`, espaços, `0` ou `"0"`) sem bloquear a operação: esses marcadores não são reenviados no PUT. Códigos numéricos válidos em texto são convertidos para número; sexo reconhece os nomes documentados sem distinguir maiúsculas/espaços e as abreviações M/F. Nenhuma classificação é deduzida do nome, documento ou da compra. Valores preenchidos desconhecidos continuam bloqueando a atualização para evitar substituições silenciosas. Logs de validação local informam código, campos, tipo recebido e motivo, sem valores pessoais e sem atribuir o erro à última consulta de nota bem-sucedida.

`limiteCredito` também difere entre consulta e atualização: o GET pode retornar zero, mas o PUT observado em produção recusa valores não positivos. Limites vazios, nulos ou zerados são omitidos do PUT de e-mail; limites positivos existentes são preservados. Não substituímos zero por um limite artificial nem tentamos alterar condições de crédito da compra. Valores negativos, não finitos ou formatos ambíguos exigem conferência antes de enviar. O mock de integração reproduz essa validação do provedor inclusive nos testes gerais de e-mail.

**Nota já gerada:** atualizar o contato não é tratado como garantia de alteração do destinatário da nota. Se o ERP mantiver o e-mail antigo, o painel informa que o cadastro foi atualizado, mas mantém a emissão bloqueada com `olist_invoice_email_required`, oferece **Abrir Olist** e permite consultar novamente após corrigir **essa mesma nota**. Não inventamos `PUT /notas/{id}`, não recriamos/cancelamos a nota e não removemos a verificação do destinatário. A autorização documentada recebe `enviarEmail`, não um endereço substituto.

As operações exigem permissão `commerce:orders:manage`, pagamento real confirmado, pedido ativo e nota pendente sem autorização em andamento ou resultado incerto. Leases por pedido e por tenant/documento serializam a atualização com o worker fiscal; pagamento, IDs e configurações são conferidos novamente na transação. A confirmação possui hash do comparativo para impedir alterações sobre uma leitura antiga. Após perda de resposta, uma nova consulta pode confirmar a atualização já realizada sem repetir o PUT. E-mails anteriores ficam cifrados no histórico; logs operacionais não incluem endereços.

Sem nova migration. Após o deploy, pedidos já bloqueados precisam da confirmação da equipe nessa ação. Homologue a atualização do contato e a leitura do destinatário da nota na conta Olist antes de confiar no envio automático; os testes locais simulam os dois comportamentos do ERP.

#### Manter Os E-mails Do Olist

No mesmo modal, selecione **Manter os e-mails do Olist**, confira a lista, autorize explicitamente a emissão/envio e informe o motivo. Se cadastro geral, campo de NF-e e nota apresentarem endereços diferentes, todos são exibidos: o ERP determina a entrega conforme seus campos; a confirmação autoriza somente os endereços apresentados. Não enviamos um parâmetro de destinatário inventado para `/notas/{id}/emitir`.

- A ação `email_use_olist` não faz PUT no contato nem altera e-mail de faturamento da compra. Exige origem/permissão administrativa, pagamento confirmado, nota pendente e conferência atual, assim como a atualização de cadastro.
- O consentimento é cifrado no evento durável `olist.email_recipient_approved`, com tenant, pedido, contato, nota, documento, total, e-mail de faturamento, endereços do ERP, responsável e data. O worker relê esse evento a cada retomada; não depende do navegador ou de estado em memória.
- Antes da primeira nota, o consentimento pode referenciar `invoiceId=null`. A criação vincula a autorização ao ID retornado e grava `olist.email_recipient_bound` na mesma transação que confirma o ID da nota. A aprovação não libera outra nota ou outro pedido.
- Antes da emissão, o worker confere novamente identidade, total e endereços. Uma mudança exige nova confirmação, não autoriza um destinatário novo silenciosamente. E-mails inválidos/ausentes desabilitam a alternativa.
- Uma solicitação posterior de usar o e-mail da compra (`olist.email_update_requested`) revoga o consentimento anterior. CPF/CNPJ, valor, produção, autorizações em andamento e demais proteções fiscais nunca são dispensados.

Falhas na atualização passaram a informar a fase (`update_contact_emails`, `verify_contact_and_invoice` etc.), método/path, status original, campos de validação e mensagem sanitizada no log `Commerce Olist email update failed`. Recusas 400/404/409/422 retornam erro de conferência, não um 503 genérico; problemas de comunicação continuam pedindo nova consulta. O debugId interno aparece na mensagem para correlacionar o diagnóstico. Endereços/documentos são removidos das mensagens registradas.

O 503 isolado da interface não identifica se o PUT falhou ou se a leitura posterior falhou. Não tratamos a mensagem genérica como prova de credencial expirada ou cadastro não atualizado. O fluxo mantém a reconciliação e oferece a alternativa sem repetir uma emissão.

## Verificação local

- Todas as 74 migrations aplicadas em banco local vazio, sem usar o projeto Supabase real.
- Suíte geral aprovada: 737 testes na rodada completa; depois dos últimos ajustes, 23 testes focados aprovados (incluindo o caso adicional de identidade de faturamento).
- Regressão de banco: 25 testes existentes de loja/campanhas aprovados e 12 novos cenários Olist aprovados, incluindo concorrência, resultado incerto, OAuth, e-mail divergente e desativação da integração.
- TypeScript, ESLint e build Next aprovados, com memória limitada e build de uma CPU.
- Playwright/Chrome em 1440, 390 e 320 px: configurações, pedido, liberação fiscal, modal, motivo obrigatório, erro dentro do modal e ausência de overflow horizontal. Mutações do teste visual interceptadas; nenhum serviço ERP, pagamento, e-mail ou Storage real foi acionado.

Para repetir a integração, crie um banco local novo com `scripts/setup-commerce-test.mjs`, configure `COMMERCE_TEST_DATABASE_URL` e execute `npm run test:local -- src/tests/integration/commerce-olist-database.test.ts`. O script e a suíte recusam bancos remotos e nomes fora de `commerce_test_*`.

## Referências oficiais

- [Listar contatos](https://api-docs.erp.olist.com/api-reference/contatos/listar-contatos)
- [Obter contato](https://api-docs.erp.olist.com/api-reference/contatos/obter-contato)
- [Atualizar contato: e-mail e e-mail de NF-e](https://api-docs.erp.olist.com/api-reference/contatos/atualizar-contato)
- [Obter nota fiscal e destinatário](https://api-docs.erp.olist.com/api-reference/notas/obter-nota-fiscal)
- [Criar pedido](https://api-docs.erp.olist.com/api-reference/pedidos/criar-pedido)
- [Gerar nota fiscal do pedido](https://api-docs.erp.olist.com/api-reference/pedidos/gerar-nota-fiscal-do-pedido)
- [Autorizar nota fiscal e solicitar e-mail](https://api-docs.erp.olist.com/api-reference/notas/autorizar-nota-fiscal)
- [Criar agrupamento de expedição](https://api-docs.erp.olist.com/api-reference/expedi%C3%A7%C3%A3o/criar-agrupamento-de-expedi%C3%A7%C3%A3o)
- [Configuração do envio de documentos pelo Olist](https://ajuda.olist.com/pedidos/configuracoes-do-envio-de-documentos)
