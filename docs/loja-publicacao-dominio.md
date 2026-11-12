# Publicação, Frete, Pagamentos e Domínio da Loja

## Ampliação: Domínio, DNS e E-mail Por Tenant

- [x] Solicitação por hostname, prova TXT exclusiva e isolamento entre tenants.
- [x] Registros esperados configurados pelo superadmin; consulta DNS sob demanda com resultados e cópia.
- [x] Etapas separadas para Vercel, propriedade, apontamento, HTTPS e vínculo no deploy.
- [x] SMTP por loja com senha criptografada, teste para o administrador e ativação explícita.
- [x] Código de acesso do comprador enviado pela empresa quando ativado, sem fallback silencioso em caso de erro.
- [x] Proteção de origem, permissões, limites de uso, bloqueio de destinos SMTP privados e auditoria sem segredos.
- [x] Testes unitários, integração local, build e conferência visual mobile/desktop.

O cadastro de DNS não altera registros no provedor e não modifica o projeto Vercel. A ativação de host continua exigindo a configuração do operador em `COMMERCE_CUSTOM_DOMAINS` e redeploy. O SMTP próprio é exclusivo das mensagens de acesso dos compradores da loja; convites e recuperação de senha dos usuários administrativos continuam no SMTP da plataforma.

### Ativação da ampliação

1. Aplique **`0077_commerce_domains_email.sql`** antes do deploy, depois das migrations anteriores. Não há nova variável de ambiente obrigatória. A senha SMTP usa a `APP_ENCRYPTION_KEY` existente, que não deve ser trocada sem migrar os segredos já criptografados.
2. Em **Loja online → Domínio e DNS**, solicite o hostname e, se desejado, a versão www. Os hosts são reservados separadamente por tenant. A solicitação não muda o roteamento atual nem a loja anterior.
3. Em **Superadmin → Domínios das lojas e DNS**, expanda a solicitação, cadastre os registros exatos de Settings → Domains da Vercel e registre as confirmações manuais de inclusão no projeto e HTTPS. Não são testes automáticos de certificado/disponibilidade.
4. O tenant copia os registros e a prova TXT `_pricing-pro.<hostname>` para o provedor DNS. Clique **Verificar DNS agora**. Endereços A/AAAA extras que não correspondem à configuração esperada impedem aprovação. TXT de propriedade da plataforma não substitui TXT eventualmente exigido pela Vercel. O TTL exibido é o esperado, não uma medição de propagação global.
5. O superadmin autoriza após uma consulta válida dos últimos dez minutos. A etapa final continua sendo mesclar os hosts em `COMMERCE_CUSTOM_DOMAINS` e fazer redeploy. Não apague os hosts de outros tenants; a primeira entrada de cada tenant define o domínio principal. Alterar os registros no painel invalida a aprovação e a consulta, mas não remove hosts do deploy. Para desativar um host já em uso, remova o vínculo no ambiente e publique novamente.
6. Em **Loja online → E-mail da empresa**, informe host SMTP público, porta 587/STARTTLS ou 465/TLS, usuário, senha de aplicativo/SMTP e remetente autorizado. O nome do remetente pode ser **Ground Shop** e o endereço deve ser uma conta/alias autorizado pelo provedor da empresa, não um endereço inventado.
7. Salve, envie o teste para seu próprio e-mail administrativo, confira recebimento/spam, marque a confirmação e ative. A aceitação pelo SMTP não garante entrega em todas as caixas. Configure SPF/DKIM/DMARC conforme o provedor de e-mail, preservando MX/TXT ao alterar o site. [Opções TLS do Nodemailer](https://nodemailer.com/smtp).
8. Campos de senha vazios preservam o segredo existente. Alterar uma configuração desativa o SMTP próprio até um novo teste/ativação; nesse intervalo é usado o SMTP da plataforma, se houver. Com SMTP próprio ativo, uma falha não provoca fallback silencioso. A operação de login informa indisponibilidade e não mantém um código válido cujo envio foi recusado.

As APIs novas exigem admin/owner do tenant ou superadmin, verificação de origem em mutações e rate limiting. O envio de teste só usa o e-mail administrativo obtido da sessão; o corpo não aceita destinatário arbitrário. O transporte resolve e fixa um IP público, rejeita redes locais/especiais, exige TLS com validação de certificado e limita tempos de conexão. A senha nunca é retornada no GET nem escrita na auditoria. As tabelas têm RLS e negam leitura SQL aos papéis públicos `anon`/`authenticated`.

Validação concluída: 842 testes unitários, 24 testes de integração em PostgreSQL local novo (incluindo cinco regressões de persistência/isolamento de domínio e SMTP), lint e build de produção com checagem de tipos aprovados. Testes focados adicionais confirmaram a atualização imediata do aviso de prontidão após ativar/desativar o remetente. `scripts/commerce-domains-email-browser.mjs` verificou solicitação raiz/www, permissões de owner/superadmin, cadastro dos registros, bloqueios de aprovação, distinção entre autorização e deploy, senha criptografada, preservação do segredo em campos vazios, teste e ativação explícita em 1440/390/320 px, sem overflow ou inputs esticados. No navegador, somente as consultas DNS e a entrega SMTP foram simuladas; os demais handlers, permissões e gravações usaram o servidor e o banco reais locais. Nenhum DNS, domínio Vercel, e-mail, cobrança ou dado de produção foi alterado.

## O Que Bloqueava a Publicação

A mensagem antiga agrupava três verificações: ao menos um produto marcado para
publicação, condições de compra preenchidas e entrega/retirada habilitada.
Cadastrar os produtos internos ou as credenciais Mercado Pago não satisfazia as
outras verificações. A cotação Melhor Envio estava limitada à prévia administrativa.

Agora a loja apresenta **Preparação para publicar**, com atalhos para cada pendência.
O servidor retorna os itens efetivamente ausentes. Uma forma de pagamento salva
também é necessária para publicar uma loja habilitada.

## Implantação

1. Aplique as migrations pendentes até **`0077_commerce_domains_email.sql`** no Supabase do deploy antes de publicar o código.
   A `0069_commerce_launch_settings.sql` introduziu as configurações de Checkout Pro e frete; a `0077` acrescenta domínio/DNS e SMTP por tenant, sem alterar DNS ou enviar e-mails automaticamente.
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

Em **Domínio e DNS**, registre `groundshop.com.br` como domínio desejado.
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
