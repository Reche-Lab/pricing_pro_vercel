# Modo de teste do e-commerce

## Checklist

- [x] Ambiente por tenant, padrão produção, com credenciais privadas de teste cifradas separadamente.
- [x] Seleção Produção/Teste em Loja online > Pagamentos e avisos ao comprador.
- [x] Ambiente imutável por pedido e registrado por tentativa, sem fallback de credenciais.
- [x] Pix com cenário APRO e cartão com dados oficiais do Mercado Pago.
- [x] Webhook separado por ambiente; consultas usam o ambiente original da tentativa.
- [x] Pedidos simulados no filtro Testes, fora dos indicadores e sem produção/expedição/PDF de produção.
- [x] Testes de regressão, banco local, revisão visual, tipos, lint e build.
- [ ] Rodar `0071_commerce_payment_test_mode.sql` no Supabase antes do deploy.
- [ ] Cadastrar credenciais reais do ambiente Teste do Mercado Pago e homologar a integração.

## Configuração

1. Aplicar `supabase/migrations/0071_commerce_payment_test_mode.sql` e fazer deploy.
2. Em Loja online > Pagamentos, selecionar **Teste**, habilitar Mercado Pago e o
   Checkout Transparente. Os campos de produção continuam preservados.
3. Na aplicação Mercado Pago, selecionar o ambiente **Teste** e copiar a Public Key
   e o Access Token para os campos de teste. Confirmar a origem das credenciais.
   O prefixo APP_USR pode ser usado também em tokens de teste: não determina o ambiente.
4. A identidade do vendedor é consultada automaticamente. Se a credencial não permitir
   `/users/me`, abrir **Identificação do vendedor de teste** e informar o User ID numérico
   do vendedor correspondente ao token, conforme o painel Mercado Pago. A confirmação
   do pagamento confere esse ID com o `user_id` retornado pelo provedor.
5. Opcionalmente cadastrar a assinatura do webhook do ambiente Teste e configurar
   o tópico **Order (Mercado Pago)** com a URL exibida, terminada em `?environment=test`.
   Sem assinatura, nenhum webhook de teste é aceito; a página consulta o status a cada
   20 segundos enquanto estiver visível, ou pelo botão Verificar pagamento.
6. Salvar e criar um **novo pedido**. Pedidos existentes não são convertidos de ambiente.

As chaves são específicas da conta/aplicação do comerciante e não podem ser geradas
pela plataforma. Nenhuma credencial de teste fictícia é instalada pelo seed. Não
compartilhar Access Token ou assinaturas em logs, chat ou arquivos versionados.

## Verificação local (09/11/2026)

- `npm run test:local`: 673 testes aprovados; 28 testes condicionais ignorados.
- PostgreSQL isolado com todas as migrations: 14 testes de integração aprovados,
  incluindo credenciais separadas, troca de ambiente, webhook assinado e bloqueio
  de produção/PDF de produção para pedido simulado.
- `npm run typecheck`, `npm run lint` e `npm run build:local`: aprovados.
- Revisão no Chrome em 1440, 390 e 320 px, com temas claro/escuro: sem overflow,
  recuperação do Pix após recarga e salvamento separado das chaves de teste.
- As respostas de pagamento foram simuladas nos testes locais. A homologação com
  a aplicação Mercado Pago do comerciante continua pendente; nenhuma cobrança real
  foi criada nesta validação.

## Comportamento

- O modo selecionado afeta novos pedidos da loja pública. Não torna a loja privada:
  visitantes também veem o aviso e podem criar pedidos simulados. Para homologação
  restrita, usar um tenant ou deploy/banco separado.
- Pix de teste envia `payer.first_name=APRO` e pagador fictício conforme o cenário
  oficial. O total continua sendo o total correto do pedido. A aprovação é simulada
  pelo Mercado Pago; não fazer transferência bancária. A imagem do QR pode vir vazia.
- Cartão utiliza o componente oficial e deve receber exclusivamente cartões oficiais
  de teste. Titular APRO e CPF 12345678909 simulam aprovação; OTHE simula recusa.
- Carteira externa, boleto e pagamento manual não são usados no modo de teste desta
  entrega. Não há fallback para produção se as chaves de teste falharem ou faltarem.
- Após uma troca de ambiente, novas cobranças de pedidos do ambiente anterior ficam
  bloqueadas pela plataforma. Consultas e notificações pendentes continuam usando o
  ambiente original. Links externos já emitidos não são cancelados automaticamente.
- Uma aprovação simulada continua marcada como teste, não entra na fila/indicadores
  de produção e não libera impressão de produção, produção, expedição ou entrega.
- Teste e produção não podem reutilizar as mesmas chaves cadastradas. Essa comparação
  não prova, sozinha, que uma chave veio do sandbox: conferir o ambiente de origem no
  painel é obrigatório. Se o provedor informar `live_mode`, divergências são rejeitadas.
- Mudanças de ambiente e pagamentos deixam histórico auditável, sem segredos.
- Frete consultado, armazenamento de artes, SMTP e serviços de IA não passam a ser
  simulados por este seletor; ele controla o pagamento e a execução do pedido.

## Voltar à produção

Selecionar Produção e salvar. O sistema exige a configuração de produção, sem copiar
as chaves de teste. Criar pedidos novos para vendas reais. Usar o filtro **Testes** na
central de pedidos para consultar as simulações; o histórico anterior à migration é
preservado, sem reclassificação automática.

## Referências

- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-cards
