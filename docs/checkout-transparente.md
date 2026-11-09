# Checkout Transparente Mercado Pago

## Planejado x realizado

- [x] Configuração por tenant: Public Key e ativação explícita, preservando Checkout Pro.
- [x] Pix e cartão via Orders API; dados sensíveis tratados pelo Card Payment Brick oficial.
- [x] Tentativas persistidas, idempotência e bloqueio contra cobranças concorrentes.
- [x] Webhook assinado e conciliação de vendedor, referência e valor no servidor.
- [x] Experiência responsiva: Pix copia e cola, cartão, autenticação 3DS e retomada.
- [x] Testes automatizados, migração local, build e revisão visual.

## Ativação

Rodar `supabase/migrations/0070_commerce_transparent_payments.sql`. Em Loja online >
Pagamentos, cadastrar a Public Key da mesma aplicação/ambiente do Access Token e
habilitar pagamento dentro da loja. Não utiliza as credenciais da assinatura SaaS.
Utilizar uma aplicação Mercado Pago habilitada para Checkout Transparente/Orders;
verificar essa habilitação se a aplicação atual foi criada apenas para Checkout Pro.
Nunca colocar Access Token ou segredo de webhook em variáveis NEXT_PUBLIC.

No painel Mercado Pago, configurar a URL de webhook exibida na loja para o evento
**Order (Mercado Pago)**, além de **Payment** para Checkout Pro já existente.
O vendedor deve ter uma chave Pix cadastrada no Mercado Pago. A habilitação e a
oferta final de cartões, débito, parcelas e juros dependem da conta do vendedor.

## Regras de segurança

O servidor usa o total imutável do pedido e a sessão do comprador. O navegador não
define valor, vendedor ou referência. Número de cartão e CVV ficam no componente
oficial; somente o token transitório é enviado ao servidor, nunca persistido ou
registrado em logs. A Public Key é pública; Access Token e segredo ficam cifrados.

Uma tentativa pendente ou de resultado incerto impede outra cobrança, inclusive
na carteira. Webhooks só sinalizam que é necessário consultar a Orders API: o
status recebido no corpo não confirma pagamento. A confirmação exige conferir
vendedor, referência e total. Recarregar a página não cria uma tentativa nova.

Pedidos com link Checkout Pro já emitido continuam naquele fluxo para não deixar
duas cobranças válidas simultâneas. Se a conexão cair antes de receber o ID da
order, aguardar webhook e revisar no painel Mercado Pago; não repetir a cobrança
com outra chave. Não há job de conciliação automática nesta entrega.

## Homologação

Antes de ativar em produção, testar em HTTPS com credenciais e compradores de
teste compatíveis: Pix, cartão aprovado/recusado, 3DS, expiração, webhook, reload,
isolamento entre tenants e retorno da carteira. Os testes locais não cobram contas
reais e não substituem a homologação da aplicação no Mercado Pago.

Validações locais desta entrega: suíte geral com 646 testes aprovados e 27
condicionais não executados; rodada direcionada com 29 testes (incluindo os cinco
adicionados depois da coleta da suíte geral); 13 integrações aprovadas em
PostgreSQL isolado, incluindo concorrência e recusa de vendedor/valor divergente.
TypeScript, lint e build com um worker aprovados. Capturas e verificações em
320/390/1440 px, claro e escuro, com cartão e QR simulados e retomada após reload.
As outras 14 integrações condicionais não foram executadas nesta entrega.

## Diagnóstico de recusa HTTP 403

- [x] Recusas da Orders API registradas como erro, não como operação bem-sucedida.
- [x] Código, causas e mensagens sanitizadas, duração, operação, ID da tentativa e
  `x-request-id` do provedor nos logs. Sem corpo bruto, token, dados de cartão ou pagador.
- [x] Mensagem de autorização da loja separada de erro nos dados do comprador.
- [x] Respostas HTML, vazias ou inválidas identificadas sem expor seu conteúdo.
- [x] Tentativas incertas continuam bloqueando novas cobranças; sem fallback automático.
- [ ] Homologar novamente com a aplicação e as credenciais do vendedor em produção.

`403` confirma uma recusa de autorização, mas sozinho não informa qual permissão
faltou. A documentação diferencia `forbidden` (permissão da aplicação/Access Token)
de `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` (restrição da conta; verificar com suporte).
Só identificar o código real da resposta permite distinguir essas situações.

O Pix usa o Access Token privado do tenant na chamada do servidor. A Public Key
não é enviada nessa operação; ela inicializa o componente de cartão no navegador.
Alterar somente a Public Key mantém o Access Token anterior se o campo ficar vazio.
Se houver troca de aplicação, atualizar o par de credenciais da mesma aplicação e
ambiente. Confirmar a habilitação da aplicação para Checkout Transparente/Orders e
a ativação das credenciais de produção no painel Mercado Pago, acessado pelo titular
ou por alguém com as permissões necessárias. Não compartilhar as chaves em logs ou chat.

Não é necessária outra migration para este ajuste. Após deploy, uma tentativa nova
registra `Commerce direct payment rejected.` com `providerCode`, `providerCodes`,
`providerMessages`, `providerRequestId` e `responseBodyKind`. Se a recusa continuar,
usar essas informações sanitizadas para revisar a aplicação ou acionar o suporte.

Validação do ajuste em 09/11/2026: 37 testes direcionados aprovados, incluindo
403 na criação e consulta, redação de dados sensíveis, tamanho máximo de resposta,
pagamento pendente preservado e orientação correta para Pix aguardando transferência.
TypeScript, lint e build de produção aprovados. Nenhuma cobrança real ou alteração
de credenciais do vendedor foi realizada durante os testes.

## Referências oficiais

- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integrate-3ds
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integration-errors/api
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/go-to-production
