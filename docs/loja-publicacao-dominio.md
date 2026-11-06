# Publicação, Frete, Pagamentos e Domínio da Loja

## O Que Bloqueava a Publicação

A mensagem antiga agrupava três verificações: ao menos um produto marcado para
publicação, condições de compra preenchidas e entrega/retirada habilitada.
Cadastrar os produtos internos ou as credenciais Mercado Pago não satisfazia as
outras verificações. A cotação Melhor Envio estava limitada à prévia administrativa.

Agora a loja apresenta **Preparação para publicar**, com atalhos para cada pendência.
O servidor retorna os itens efetivamente ausentes. Uma forma de pagamento salva
também é necessária para publicar uma loja habilitada.

## Implantação

1. Aplique `supabase/migrations/0069_commerce_launch_settings.sql` no Supabase do deploy.
   Ela acrescenta configurações de Checkout Pro e cotações privadas de frete, sem
   publicar lojas ou alterar credenciais. É idempotente.
2. Publique o código e mantenha `COMMERCE_ENABLED=true` no ambiente Vercel.
3. Mantenha `APP_URL=https://liaflow-calcula.vercel.app` enquanto esse for o domínio
   do painel. Não o substitua pelo domínio comercial da Ground Shop.
4. Confira SMTP (login do comprador por código), Storage privado/público já usados
   pela loja e o funcionamento dos uploads. O painel sinaliza SMTP/HTTPS ausentes,
   mas não realiza uma entrega de e-mail nem uma compra como teste automático.
5. Salve primeiro como **Rascunho** se ainda precisar configurar pagamentos.

## Configuração Por Tenant

### Catálogo e Condições

Em **Loja online → Loja e catálogo** selecione o canal, confira os preços copiados,
ative **Publicar este produto** nos produtos desejados e revise as condições de
compra/produção/entrega/privacidade. As páginas institucionais não substituem esse
campo de condições do checkout. Os textos devem ser revisados pela operação.

### Entrega e Retirada

Podem coexistir:

- **Retirada gratuita**: exige endereço/horário.
- **Entrega com preço fixo**: a tarifa vale para qualquer CEP; use somente se a
  operação atender toda a área de venda nessas condições. Não há cerca geográfica.
- **Melhor Envio no checkout**: utiliza a conexão do tenant em Configurações,
  CEP do remetente, dimensões/pesos dos produtos e a seleção inteligente de caixa.

Para Melhor Envio, configure produção, serviços, conexão válida, CEP de origem e
ao menos uma embalagem ativa. Produtos publicados precisam ter largura,
comprimento, altura e peso positivos. Sandbox permanece restrito à prévia.
Falhas da transportadora não inventam um frete gratuito; opções fixa/retirada
continuam disponíveis se habilitadas.

O produto oferece estimativa. No checkout, **Calcular frete do carrinho** consulta
todos os itens e permite selecionar um serviço, como PAC/SEDEX, conforme retornado
pelo provedor. Seguro usa o valor dos produtos calculado no servidor e é distribuído
entre volumes, sem multiplicar o valor declarado pela quantidade de caixas.

A cotação do checkout é privada, válida por 15 minutos e vinculada a tenant,
sessão, revisão/conteúdo/valor do carrinho, revisão da loja e CEP. O servidor não
aceita o preço enviado pelo comprador. O serviço selecionado e o preço são
preservados no pedido; mudar carrinho/CEP ou expirar exige nova cotação.
Cotar e confirmar um pedido não compram frete nem emitem etiqueta automaticamente.

Endpoints novos:

- `POST /api/store/{slug}/checkout-delivery`: sessão opaca do comprador, body
  `{ "postalCode": "01001000", "revision": 2 }`. Retorna opções com `quoteId`
  para transportadoras; informe esse ID como `shippingQuoteId` no checkout.
- `POST /api/commerce/{slug}/preview/checkout-delivery`: prévia administrativa do
  próprio tenant, acrescentando `lines` ao body. Não grava cotações nem pedidos.

### Mercado Pago

Em **Pagamentos**, configure o Access Token do vendedor e a chave de assinatura dos
Webhooks; habilite Checkout Pro. As credenciais são do tenant, não da assinatura.
Escolha Pix, crédito, débito, boleto e o máximo de parcelas (1–12). As restrições
são enviadas em `payment_methods` de novas preferências; preferências já criadas
mantêm sua configuração original.

A disponibilidade final depende da conta, país, bandeira e elegibilidade do
Mercado Pago. Marcar débito não garante todos os cartões/bancos. Juros, taxas e
parcelamento sem juros são definidos na conta do vendedor; não são prometidos
pelo limite de parcelas da plataforma. Saldo da carteira não é removido por esses
controles. [Documentação oficial das preferências](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-settings/payment-methods).

Copie a URL exibida na aba Pagamentos para a configuração de Webhooks de pagamento
da aplicação Mercado Pago do vendedor:

`https://liaflow-calcula.vercel.app/api/store/ground-shop/payment-webhook`

O retorno do navegador não comprova pagamento; a reconciliação existente confere
assinatura, recebedor, pedido, moeda e valor consultando a API. Nenhuma compra real
ou alteração na conta Mercado Pago foi executada pela implementação.

## URL Inicial e Domínio Próprio Ground Shop

Sem domínio autorizado, a URL é:

`https://liaflow-calcula.vercel.app/loja/ground-shop`

Em **Endereço da loja**, registre `groundshop.com.br` como domínio desejado.
Esse campo não altera DNS, cria certificado ou autoriza o domínio sozinho.

Antes de retirar o site atual do ar:

1. Homologue catálogo, frete com embalagens reais, acesso por e-mail, artes,
   checkout e confirmação por webhook na URL da plataforma.
2. No mesmo projeto Vercel do Pricing Pro, adicione `groundshop.com.br` e
   `www.groundshop.com.br` em **Settings → Domains**.
3. Configure no provedor DNS os registros **exatos** exibidos pelo Vercel para
   este projeto. Em geral, domínio raiz usa A e www usa CNAME; não copie IPs antigos
   sem conferir. Preserve MX, SPF, DKIM e outros TXT usados pelo e-mail.
   [Guia oficial Vercel](https://vercel.com/docs/domains/set-up-custom-domain).
4. Configure no ambiente de produção Vercel e faça redeploy:

```dotenv
COMMERCE_CUSTOM_DOMAINS='{"groundshop.com.br":"ground-shop","www.groundshop.com.br":"ground-shop"}'
```

No formulário de variáveis do Vercel, o nome é `COMMERCE_CUSTOM_DOMAINS` e o valor
é somente o JSON, sem o nome da variável nem as aspas simples externas do `.env`.

5. A primeira entrada do tenant é a URL principal. O www e as páginas públicas
   `/loja/ground-shop/...` na plataforma redirecionam para ela, mantendo o caminho
   e a query. A loja passa a atender `/`, `/catalogo`, `/produto/{id}`,
   `/carrinho`, `/conta`, `/checkout`, `/pedidos` e as páginas institucionais.
6. Confira HTTPS, domínio principal no Vercel, carrinho e retorno de pagamento.
   O webhook continua no domínio do painel. Cookies de compra são host-only;
   carrinhos criados antes da troca de domínio não migram entre os hosts.
   Redirecione somente o `www` comercial para o domínio comercial principal;
   **não redirecione `liaflow-calcula.vercel.app` inteiro para a loja**.
7. Envie `https://groundshop.com.br/sitemap.xml` ao Search Console. Canonical,
   Open Graph, dados estruturados, sitemap e robots passam a usar o domínio da loja.

O registro de hosts é operado pela administração da plataforma, com associação
explícita host → tenant. Não há autoatendimento para reivindicar domínio alheio,
gerenciamento de DNS ou provisionamento automático via API Vercel nesta versão.
No domínio comercial, APIs de outros tenants e o painel administrativo não são
expostos; mutações exigem mesma origem e o slug correto. A prévia continua privada
na URL do painel. Não habilite o mapeamento antes de validar propriedade e DNS.

## Homologação Pendente

- Compra real controlada/teste conforme as regras Mercado Pago, incluindo Pix,
  crédito/parcelas e débito elegível; conferir atualização pelo webhook.
- Frete com CEPs e quantidades reais, múltiplos produtos, pesos e caixas físicas.
- Login por e-mail, armazenamento, artes aprovadas e produção.
- Conferência comercial/jurídica das condições antes da divulgação.
- Alteração de DNS e verificação HTTPS do domínio desejado, a cargo do operador.
- Mapeamento das URLs antigas de produtos/categorias da loja anterior e respectivos
  redirecionamentos permanentes antes da troca do domínio, para preservar links e SEO.
