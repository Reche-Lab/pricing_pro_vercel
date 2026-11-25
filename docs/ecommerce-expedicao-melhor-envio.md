# Expedição de pedidos da loja

## Ativação

1. Antes do deploy, aplicar na ordem `0083_commerce_order_shipments.sql`, `0084_commerce_order_notifications.sql` e `0085_commerce_shipping_olist_sync.sql` no banco correto.
2. O tenant precisa ter a conexão Melhor Envio de **produção**, com permissão de cotação, carrinho, compra, geração, impressão e consulta de pedidos. As mesmas credenciais OAuth existentes são utilizadas, inclusive na renovação automática.
3. No aplicativo Melhor Envio, cadastrar o webhook **`https://liaflow-calcula.vercel.app/api/commerce/webhooks/melhor-envio`**. Se o domínio administrativo mudar, usar o novo domínio da plataforma, não o domínio personalizado da loja. A assinatura `X-ME-Signature` é verificada com o `clientSecret` criptografado da conexão à qual a etiqueta pertence. Não é necessária nova variável de segredo.
4. Confirmar que o SMTP em **Loja online > E-mail da empresa** está configurado e testado. Na ausência de SMTP próprio, utiliza-se o remetente global já configurado. Os links utilizam o domínio autorizado da loja, sem confiar no cabeçalho Host da requisição.
5. Após o deploy, conferir a execução do schedule privado **`commerce-order-updates`**, a cada 15 minutos. Ele drena e-mails pendentes e atualizações de rastreio no Olist; **não consulta rastreio periodicamente**. O envio inicial dos e-mails também é solicitado após as operações via Next `after`.

O webhook só acompanha etiquetas emitidas pelo mesmo aplicativo onde foi cadastrado. Não existe compra automática de etiquetas ao confirmar pagamento de produtos.

## Fluxo administrativo

Em **Loja online > Pedidos > pedido**, a seção **Envio · Melhor Envio** aparece para entrega contratada por esse provedor.

- Confirmar pagamento, preparar/aprovar as artes e iniciar a produção.
- Ao concluir a produção, conferir o documento fiscal e o remetente. Informar a chave da NF-e autorizada (44 dígitos) e a inscrição estadual ou `ISENTO`, quando aplicável. Quando disponível, a chave é recuperada da NF-e autorizada vinculada no Olist. Essa recuperação não emite nem autoriza uma nota por conta própria.
- Marcar a confirmação de produção concluída e escolher **Revisar envio**. O modal apresenta destinatário, CEPs, medidas, peso, serviço e custo atualizado.
- **Carrinho** cria as etiquetas sem cobrar. **Pagar etiqueta** abre confirmação de cobrança real na conta Melhor Envio do tenant. A diferença entre preço cobrado do cliente e custo atual precisa ser aceita; a compra não altera o total da loja nem cobra o comprador novamente.
- Após confirmação da compra, gerar e imprimir. A impressão utiliza link **privado**, que pode exigir login do operador no Melhor Envio.

Cada volume tem identificador próprio e pode ter um código de rastreio distinto. Quantidades e valores dos produtos são distribuídos, não multiplicados pelo número de etiquetas. O serviço contratado é preservado. Dados atuais do destinatário/remetente devem coincidir com os CEPs registrados na cotação.

Pedidos anteriores a esta atualização não possuem todos os dados de embalagem congelados. A conferência reconstrói a embalagem a partir dos cadastros atuais e informa essa condição antes de emitir. Sem embalagem ou dados fiscais válidos, não há emissão automática.

## Conciliação e segurança

As operações possuem exclusão mútua persistida. O identificador da etiqueta vem da criação do carrinho, nunca do pagamento. Uma resposta ambígua da compra é conciliada por consulta antes de qualquer nova cobrança; se não for possível comprovar o resultado, permanece bloqueada para conferência no provedor.

Se a resposta da **criação** de uma etiqueta se perder antes de persistir seu identificador, o volume permanece bloqueado. Conferir o carrinho Melhor Envio usando a identificação `commerce:<pedido>:<volume>` antes de qualquer intervenção administrativa. Não remover o registro nem recriar a compra sem essa conferência.

Retirada pessoal, pedido de teste, estorno, encerramento ou falta de pagamento impedem compras reais. Permissões administrativas são verificadas no servidor. Etiquetas, documentos, custos de operação e credenciais não são expostos na área do cliente.

## Acompanhamento e notificações

**Etiqueta gerada não significa postagem.** O cliente vê a preparação do envio, os códigos por volume e os links seguros em **Meus pedidos**. Webhooks assinados atualizam postagem, entrega e ocorrências; eventos repetidos ou antigos não fazem o pedido retroceder. Entrega concluída exige todos os volumes entregues.

Os e-mails cobrem pedido recebido, pagamento confirmado/estornado, produção, prova de arte disponível, postagem, código disponibilizado, ocorrência e conclusão. Eventos técnicos, como criar carrinho de etiquetas, não geram e-mail ao comprador. A área administrativa mostra pendências/falhas e permite solicitar nova tentativa das falhas.

### Apresentação dos e-mails

As mensagens usam um modelo responsivo compartilhado, com logo, nome, cor e contatos cadastrados na loja. O botão de acompanhamento usa apenas o domínio autorizado da loja. O conteúdo continua legível sem imagens; a versão em texto contém as mesmas informações essenciais. Códigos de acesso ficam destacados no corpo, não na prévia da mensagem.

Quando o pedido possui os dados necessários, as atualizações apresentam produtos, quantidades, nomes das artes, valores, benefício por arte pronta, frete, total e endereço de entrega ou local de retirada. Os prazos são os registrados na compra, não uma nova promessa de entrega. Rastreios são apresentados por volume nos eventos correspondentes. CPF/CNPJ e documentos fiscais não são incluídos nesses e-mails. Dados históricos inconsistentes não geram valores inventados: a mensagem mantém o acesso ao pedido para conferência.

O mesmo padrão visual atende códigos de login da loja, confirmação de orçamento público, convites, recuperação de senha, solicitações de acesso, comprovantes de aceite e teste de SMTP. O remetente e as regras de envio não mudam. E-mails enviados diretamente pelo Olist ou pelo provedor de pagamento continuam usando os modelos desses serviços.

Prévia isolada com dados fictícios, sem banco ou envio SMTP: `node scripts/transactional-email-preview.mjs --serve`. Sem `--serve`, o script executa as verificações visuais com Playwright. Não é necessário iniciar o Next nem aplicar outra migration para alterar a apresentação dos e-mails.

A fila é gravada na mesma transação da mudança de estado, sem envio SMTP dentro da transação. Há tentativas limitadas e deduplicação por marco/código. SMTP não oferece garantia de entrega exatamente uma vez: uma queda após aceitação do e-mail e antes do registro final pode ocasionar repetição. Falhas de e-mail não desfazem compra, postagem ou entrega.

Para tenants com Olist habilitado e NF-e autorizada, o código principal é enviado ao pedido de venda e à nota fiscal. Todos os códigos continuam disponíveis na loja. Uma falha Olist fica pendente e não apaga a etiqueta nem bloqueia seu rastreio. O schedule reenvia apenas atualizações de despacho idempotentes, nunca cria outro pedido ou outra nota.

## Validação

Os testes de banco exigem `COMMERCE_TEST_DATABASE_URL` apontando para um banco descartável `commerce_test_*` em `127.0.0.1`. Provedores e e-mails são simulados. Nunca usar a URL do banco de produção nesses testes.

Referências: [compra de fretes](https://docs.melhorenvio.com.br/docs/compra-de-fretes), [webhooks](https://docs.melhorenvio.com.br/docs/webhooks), [impressão](https://docs.melhorenvio.com.br/reference/impressao-de-etiquetas).
