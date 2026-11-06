# Loja online opcional: piloto

## Pedidos, Alertas e Produção

Aplicar `0068_commerce_order_workspace.sql` após a `0067`. Nenhuma variável nova:
o módulo continua dependendo de `COMMERCE_ENABLED=true`.

- **Pedidos da loja** (`/commerce/orders`) é a área operacional, separada da
  configuração da loja. Filtre compras por pagamento, preparação de artes,
  aprovação do cliente e produção; abra o pedido para conferir os itens e arquivos.
- O sino no topo apresenta compras e atualizações não vistas. A leitura é
  individual e persistida no banco. Abri-lo não limpa os avisos: abrir o pedido
  marca somente a atualização exibida. Mudanças posteriores geram novo aviso.
  Há consulta a cada 60 segundos com a aba visível, ao voltar à janela e após ações
  da equipe. Não há push, e-mail ou som nesta etapa.
- **Produção e impressão** mostra o pagamento e a quantidade de artes aprovadas.
  As folhas A4 usam as versões enquadradas aprovadas e as quantidades do pedido,
  com opção de incluir/retirar as linhas de corte. A API continua conferindo
  pagamento, aprovação e geometria; o limite síncrono permanece em 1.000 unidades.
- **Preparação e aprovação das artes** permite abrir a arte atual, baixar o
  original do cliente, retocar, enquadrar e publicar uma prova na conta do comprador.
  Um ajuste invalida a aprovação anterior sem alterar preços. A produção aguarda
  nova aprovação explícita do cliente. Após iniciar a produção, a edição é bloqueada.
- Confirmar pagamentos manuais e avançar produção/envio/conclusão exige permissão
  específica, confirmação e observação registrada no histórico.

Permissões padrão por perfil:

| Perfil | Consultar e imprimir | Preparar artes | Pagamento manual e etapas | Configurar loja |
| --- | --- | --- | --- | --- |
| Owner / Admin | Sim | Sim | Sim | Sim |
| Manager | Sim | Sim | Sim | Não |
| Sales / Support | Sim | Sim | Não | Não |
| Viewer | Sim | Não | Não | Não |

As permissões são `commerce:orders:read`, `commerce:artworks:write` e
`commerce:orders:manage`. Todos os dados, arquivos e marcadores de leitura são
isolados por tenant. Os endpoints administrativos mantêm sessão da plataforma;
não aceitam cookies do comprador nem tokens públicos de orçamento.

## Páginas Institucionais Da Ground Shop

No tenant de slug `ground-shop`, a loja e a prévia possuem as páginas
`quem-somos`, `termos-de-uso`, `politica-de-reembolso`, `politica-de-troca` e
`politica-de-privacidade`. Os links ficam no rodapé e em Condições de compra.
Exemplo público: `/loja/ground-shop/quem-somos`. Na prévia, use
`/commerce/ground-shop/preview/quem-somos`, com a mesma autorização da loja.
Não há migration nem variável nova. Os textos são conteúdo editorial versionado
em `src/domain/commerce/institutional.ts`, ainda sem CMS administrativo; eles não
são aplicados a outros tenants. O contato utiliza os dados cadastrados na loja.

As referências são as [cinco páginas do site atual](https://www.groundshop.com.br/quem-somos/)
e as políticas correspondentes nos mesmos slugs. A leitura de 19/10/2026 encontrou
prazos conflitantes de 7 e 30 dias para defeitos e a exigência de embalagem original.
A nova redação distingue arrependimento de garantia, sem reproduzir essas limitações
como perda automática de direitos. A antiga promessa de estorno em até 30 dias
após a devolução não foi repetida para arrependimento, pois o
[CDC, art. 49](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
prevê restituição imediata. **Antes da publicação, revisar comercial e juridicamente
os textos e confirmar CNPJ, razão social, endereço, canais de contato, logística
reversa e práticas reais de tratamento de dados.** A aprovação da arte não exclui
responsabilidade por defeitos, e produtos personalizados não receberam exclusão
automática de direitos. Esta entrega não implementa consentimento de marketing
nem um novo sistema de gestão de solicitações de privacidade.

SEO: o HTML inicial contém todo o texto e o sumário. Cada página tem metadados
próprios, canonical, Open Graph/Twitter e JSON-LD de página, organização e breadcrumbs.
O sitemap geral fica em `/sitemap.xml`; o específico, em
`/loja/ground-shop/sitemap.xml`. Somente lojas publicadas e ativas entram no sitemap;
prévias, carrinhos, contas e pedidos não entram. `APP_URL` deve apontar para a origem
de produção realmente usada. Não apontar o canonical para o domínio antigo enquanto
ele ainda servir outra loja. A rota continua com `/loja/ground-shop`: domínio próprio
sem esse prefixo depende do futuro módulo de domínios, não é ativado por esta entrega.
Após o deploy, cadastrar o sitemap no Google Search Console e conferir as URLs na
ferramenta de inspeção e no validador do Schema.org. Metadados e sitemap não garantem
indexação, posicionamento ou rich results; FAQ é interação de leitura, sem promessa
de resultado especial do Google. Robots não substitui controle de acesso.

## Escopo desta entrega

O e-commerce é um módulo separado dos orçamentos administrativos. Não publica
produtos automaticamente, não exige Olist e não altera o fluxo dos tenants que
continuam usando somente o precificador. Ground Shop é configurada pelos mesmos
cadastros que qualquer outro tenant, sem regras comerciais exclusivas no código.

Nesta versão estão disponíveis:

- Administração em **Configurações > Geral > Loja online**, também acessível em `/commerce`.
- Identidade da loja, cor, logo, capa, atendimento e condições de compra.
- Publicação explícita de produtos existentes, upload de foto, descrição, categoria e limites de compra.
- Catálogo pesquisável, página de produto e carrinho persistente por sessão.
- Quantidade por grupo de arte e preço por grupo, total do produto ou média por arte.
- Cálculo no servidor, centavos e confirmação do total no checkout.
- Upload de JPEG, PNG e WebP, seleção de versão, retoque, enquadramento e aprovação no carrinho.
- Conta do comprador por código enviado ao e-mail, separada dos usuários administrativos.
- Checkout com retirada ou entrega de valor fixo, destinatário e aceite das condições.
- Pagamento manual e Mercado Pago Checkout Pro, com credenciais próprias de cada vendedor.
- Acompanhamento do pedido pelo comprador, confirmação manual e etapas de produção pela administração.
- Download administrativo das artes e PDF A4 de produção após confirmação do pagamento.

## Ativação

1. Com as migrations anteriores aplicadas, execute **`0062_optional_commerce.sql`** no SQL Editor do Supabase correto. A migration não ativa nenhuma loja.
2. Adicione `COMMERCE_ENABLED="true"` ao `.env` local e/ou às variáveis do ambiente da Vercel; reinicie o servidor ou faça novo deploy.
3. Mantenha `APP_URL` com a URL canônica da aplicação, com HTTPS em produção.
4. Verifique o SMTP já existente, necessário para enviar o código de acesso dos compradores.
5. Para artes, mantenha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` válidos e o bucket privado `artwork-production` configurado pelo módulo existente. Não crie policy pública para as artes.
6. Entre como owner/admin do tenant e abra `/commerce`. Salve a configuração inicialmente em **Rascunho**.
7. Escolha o canal de preços, adicione somente os produtos que serão vendidos, informe fotos reais e confira as geometrias dos personalizados.
8. Configure entrega, condições de compra e ao menos um meio de pagamento. Depois habilite a loja e selecione **Publicada**.

### Upload das imagens da loja

Execute também **`0063_commerce_media_bucket.sql`**. Ela cria o bucket público
`commerce-media`, destinado somente a logo, capa e fotos do catálogo. As artes dos
compradores continuam no bucket privado `artwork-production`, sem alteração.

Os controles **Enviar imagem**, **Substituir imagem** e remover estão disponíveis
em Identidade e atendimento e em cada produto publicado. Há prévia e retorno de
sucesso/erro. Após o upload, clique em **Salvar loja e catálogo** para aplicar.
O salvamento fica bloqueado enquanto houver imagens em envio.

São aceitos PNG, JPEG e WebP não animados de até 3 MB. O servidor valida e converte
para WebP, remove metadados e limita a dimensão maior a 512 px no logo, 2.400 px na
capa e 1.600 px no produto, sem distorcer proporções ou remover transparência.
Uploads exigem owner/admin, origem autorizada e são gravados em caminho exclusivo
do tenant, com nome novo a cada envio. Não conceda escrita pública ao bucket.

As URLs antigas continuam válidas. Remover ou substituir uma seleção não apaga o
arquivo antigo do Storage, evitando quebrar referências já publicadas. A limpeza
de arquivos sem referência permanece uma evolução de retenção do módulo.

Nenhuma variável nova é necessária além de `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` já usadas no projeto. A flag `COMMERCE_ENABLED` não mudou.

Checklist desta melhoria (06/09/2026):

- [x] Upload, prévia, substituição, remoção e bloqueio de salvamento durante envio.
- [x] Validação do conteúdo, otimização da imagem e caminhos por tenant.
- [x] Testes de interface, arquivos inválidos, isolamento do caminho e autorização da API.
- [x] Suíte local: 211 testes aprovados; 5 testes de banco separados não executados nesta alteração.
- [x] Build de produção, lint e TypeScript aprovados com execução de baixo consumo.
- [ ] Rodar a migration 0063 no Supabase e confirmar upload no Storage real.

A loja do piloto ficará em `/loja/ground-shop`. Outros tenants usam seu próprio slug.
Não é necessário preencher `.env` com credenciais de cada loja: as credenciais de
pagamento são armazenadas de forma criptografada por tenant no banco.

### Pré-visualizar sem publicar

Mantenha **Publicação: Rascunho**, salve a configuração e clique em
**Pré-visualizar loja**, no topo da administração. O botão abre uma nova aba em:

```text
/commerce/ground-shop/preview
```

Cada tenant possui seu próprio caminho: `/commerce/SLUG_DO_TENANT/preview`.
A prévia funciona mesmo com a loja desabilitada para visitantes, desde que o
módulo esteja habilitado no ambiente (`COMMERCE_ENABLED=true`).

É possível navegar no catálogo, pesquisar produtos e simular uma compra completa:

1. Abra um produto personalizado, escolha quantidade e número de artes e adicione ao carrinho.
2. Clique em **Abrir carrinho e preparar artes** ou no ícone do carrinho.
3. Em cada item, **Enviar arte** abre o estúdio guiado. Use **Retocar arte** se precisar ajustar a imagem, **Salvar e enquadrar** para continuar e **Revisar e aprovar** para conferir o resultado. A aprovação exige confirmação explícita da versão exibida. Os atalhos **Retocar**, **Enquadrar** e **Aprovar arte** continuam disponíveis no carrinho.
4. Continue para entrega. Use **Preencher dados de teste**, se necessário, aceite as condições e conclua a simulação.

O produto precisa estar salvo no catálogo da loja como personalizado e com a
geometria de corte configurada. Os editores usam as mesmas guias e preparação do
fluxo público. PNG, JPEG e WebP de até 3 MB são aceitos; a prévia limita a 20 versões
e 24 MB de dados de imagens codificadas em memória para não sobrecarregar o navegador.

O carrinho, arquivos e aprovações são temporários, preservados durante a navegação
interna da prévia. Recarregar, fechar ou sair da prévia descarta a simulação.
Não há sessão de comprador, pedido, pagamento ou upload no Storage real. Imagens
são processadas por uma API administrativa autenticada e devolvidas ao navegador,
sem persistência. Apenas as consultas e controles de limite de uso acessam o banco.

A prévia mostra **a última versão salva**, não alterações ainda pendentes no
formulário. Depois de editar, salve e atualize a aba da prévia. Ao publicar,
o endereço público continua sendo `/loja/SLUG_DO_TENANT`.

O link não é um token público: exige sessão administrativa com permissão no tenant
ativo. Um administrador de outro tenant não pode usá-lo. Página e APIs de preços/artes
verificam esse acesso separadamente. As respostas são privadas, sem cache
compartilhado, e marcadas para não indexar. Imagens do catálogo no bucket público
continuam sendo imagens públicas, mesmo quando a página está em rascunho.

Não há migration nem variável nova para a prévia.

Verificação da prévia (06/09/2026):

- [x] Rota por tenant e botão disponível após o primeiro salvamento.
- [x] Acesso administrativo e consulta limitada ao tenant ativo.
- [x] Links de catálogo, produto e condições mantidos na rota privada.
- [x] Simulação de preços autenticada, sem criar sessão de comprador ou liberar compras.
- [x] Cabeçalhos de privacidade e bloqueio de indexação.
- [x] Suíte local: 215 testes aprovados; testes de banco separados não executados nesta alteração.
- [x] Build de produção, lint e TypeScript aprovados.

`APP_ENCRYPTION_KEY` deve permanecer estável: alterá-la sem migração dos segredos
impede a leitura das credenciais já salvas. Não use as credenciais da cobrança da
assinatura do Pricing Pro como credenciais dos vendedores.

### Home, banners e temas

Em **Loja online**, escolha o **Tema inicial da loja**: claro, escuro ou conforme
o dispositivo. O visitante pode alternar pelo ícone no cabeçalho. A preferência
fica salva no navegador separadamente para cada loja; não muda o tema administrativo.

Em **Banners da página inicial**, cadastre até cinco banners, ordene pelas setas e
escolha o destino no catálogo. Cada banner aceita upload de imagem principal e
uma imagem opcional para celular, título, mensagem e texto do botão. Desative
**Exibir título, mensagem e botão sobre a imagem** quando a própria imagem já
contiver os textos. Nesse modo, toda a imagem abre a categoria escolhida.
Sem carrossel cadastrado, a capa anterior continua funcionando; sem capa, a home
mostra a identidade da loja e o catálogo, sem imagens fictícias.

Salve as alterações e use **Pré-visualizar loja** para conferir antes de publicar.
Para banners somente com imagem, as áreas têm proporção 2,6:1 em desktop e 1,15:1
no celular. A imagem inteira é preservada, podendo haver espaço nas laterais se
a proporção enviada for diferente. Banners com texto sobreposto usam preenchimento
da área; uma versão própria para celular evita cortes indesejados.

A home reúne busca no cabeçalho, navegação por categoria, carrossel de produtos,
coleções e destaque da primeira categoria. Os produtos e preços vêm do catálogo
publicado, sem regras de preço novas. Carrosséis permitem navegação por toque e
botões; os banners têm pausa e respeitam a preferência de movimento reduzido.

Checklist desta melhoria (06/09/2026):

- [x] Home responsiva e carrosséis de banners/produtos, com imagens reais do catálogo.
- [x] Upload e ordenação de até cinco banners, com versão própria para celular.
- [x] Temas claro, escuro e sistema, com preferência do visitante por tenant.
- [x] Busca e categorias preservam os caminhos da prévia privada.
- [x] Navegador: 320, 390, 768 e 1365 px, temas, navegação e ausência de overflow horizontal.
- [x] Cinco testes de integração passaram em Postgres local isolado.
- [x] Suíte completa: 220 testes aprovados; TypeScript, lint e build de produção aprovados.
- [ ] Cadastrar e revisar os banners definitivos de cada loja antes da publicação.

Não há migration nem variável nova: banners e tema são campos opcionais do JSON
de configurações já existente. A configuração antiga permanece compatível.

## Preços e artes

### Galeria de fotos e vídeos dos produtos

Em **Loja online > Loja e catálogo**, abra o produto e use **Galeria > Adicionar
mídias**. É possível selecionar vários arquivos; o envio acontece um por vez,
com progresso e preservação dos arquivos concluídos caso um dos próximos falhe.
A foto antiga continua sendo a capa dos produtos já cadastrados.

Limites aplicados na interface e no servidor:

| Mídia | Limite por arquivo              | Formatos                       |
| ----- | ------------------------------- | ------------------------------ |
| Foto  | 3 MB e 25 megapixels de entrada | PNG, JPEG e WebP, sem animação |
| Vídeo | 20 MB                           | MP4 ou WebM                    |

Cada produto aceita **até 10 mídias no total, sendo no máximo 2 vídeos**. Exemplos:
10 fotos, 9 fotos + 1 vídeo ou 8 fotos + 2 vídeos. A capa conta nesse total e deve
ser uma imagem. As setas alteram a ordem; a estrela escolhe a capa e a lixeira
remove a seleção. Depois clique em **Salvar loja e catálogo**.

As fotos são otimizadas para WebP, até 1.600 px no maior lado, sem ampliar arquivos
menores. Os vídeos não são recomprimidos: recomenda-se MP4/H.264, áudio AAC,
resolução até 1080p e duração de 30 a 60 segundos. Resolução e duração são
recomendações, não limites adicionais de validação. O servidor confere tamanho
real e assinatura do contêiner; a compatibilidade de codecs depende do navegador.

Na página do produto e na prévia privada, há imagem principal, miniaturas, setas
e navegação por toque nas imagens. Vídeos carregam somente quando selecionados,
com controles nativos, reprodução inline e sem autoplay. A capa continua sendo
usada nos carrosséis e no carrinho.

#### Ativação dos vídeos

1. Execute **`0064_commerce_product_videos.sql`** após as migrations anteriores.
2. Mantenha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já configuradas; nenhuma variável nova é necessária.
3. Confira se o limite global de arquivos do Storage permite pelo menos 20 MB.
4. Faça o deploy e homologue um upload real de vídeo na galeria.

A migration cria o registro de uploads e dois buckets: `commerce-video-staging`
**privado** e `commerce-videos` **público**, ambos limitados a 20 MB e aos MIME types
de MP4/WebM. Não adicione policies públicas de escrita. O bucket de fotos e as
artes privadas dos compradores não são alterados.

O upload direto usa URL assinada para um caminho exclusivo e sem sobrescrita no
bucket privado. A conclusão exige novamente administrador, mesmo tenant e mesmo
usuário que iniciou o envio; só então o servidor valida o arquivo e o publica.
A publicação do catálogo rejeita vídeos pendentes, URLs alteradas ou vídeos de
outro tenant. A conclusão é idempotente e registra auditoria. Tokens assinados e
credenciais do Storage não aparecem nos logs.

O fluxo segue o [upload assinado do Supabase](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
para não enviar os vídeos pelo corpo das funções da Vercel. As autorizações de
upload e os registros pendentes expiram em duas horas. A remoção do arquivo
temporário após concluir é best-effort: periodicamente remova do bucket privado
arquivos pendentes/abandonados com mais de 24 horas. Remover mídia de um produto
não apaga o arquivo público, evitando quebrar pedidos e outras referências.
Retenção automática desses arquivos continua pendente.

Checklist desta melhoria:

- [x] Galeria de até 10 mídias, com no máximo 2 vídeos e imagem de capa obrigatória.
- [x] Upload múltiplo sequencial, progresso, reordenação, capa e remoção.
- [x] Upload de vídeo privado, validação antes de publicar e autorização por tenant.
- [x] Navegador: 1365, 390 e 320 px; seleção e reprodução de vídeo com arquivo local de teste.
- [x] Seis testes de banco em Postgres local, incluindo persistência e isolamento dos vídeos.
- [x] Suíte: 235 testes aprovados; TypeScript, lint e build de produção aprovados.
- [ ] Rodar a migration 0064 e homologar o Storage real. Os testes locais não enviaram arquivos ao Supabase real.

Ao salvar o catálogo, a loja copia a curva e as taxas do canal selecionado. Alterações
posteriores no precificador não mudam essa publicação até salvá-la novamente.
Pedidos já criados preservam seus próprios itens, valores, geometria e condições.

- **Por arte:** cada grupo usa sua quantidade para consultar a curva.
- **Total:** grupos do mesmo produto compartilham a quantidade total como referência.
- **Média:** a referência é a quantidade total dividida pelo número de grupos.

A distribuição de quantidades inteiras preserva o total mesmo quando a divisão
não é exata. Para personalizados, cada grupo precisa de arte enquadrada e aprovada
antes de concluir. Depois de usada em um pedido, a arte não pode ser modificada
pelo fluxo do carrinho.

Limites do piloto: 3 MB por upload, até 40 versões por sessão, corte de até 150 mm
por dimensão e PDF síncrono de até 1.000 unidades por pedido. Produtos maiores e
pedidos de produção extensos precisam de uma evolução assíncrona antes de publicar.

## Pagamentos

### Manual

Informe as instruções de pagamento. O pedido permanece pendente até o administrador
confirmar o recebimento com uma observação. Somente então as próximas etapas são
liberadas. Esse fluxo não consulta automaticamente um banco ou uma chave Pix.

### Mercado Pago

Em **Pagamentos**, configure o access token do vendedor e a chave secreta de
assinatura dos webhooks da aplicação desse vendedor. A conexão valida a conta e
registra o ID do recebedor; não há onboarding OAuth nesta versão.

Cadastre notificações de pagamento para:

```text
https://SEU_HOST/api/store/SLUG_DO_TENANT/payment-webhook
```

O checkout usa redirecionamento hospedado, sem receber dados de cartão no Pricing
Pro. A volta do navegador não confirma pagamento. O servidor valida a assinatura,
consulta o pagamento no Mercado Pago e confere recebedor, pedido, moeda e valor
antes de atualizar o pedido. A implementação solicita somente Webhooks na
`notification_url`, conforme a [documentação oficial de notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).

Faça a homologação com contas de teste e o fluxo recomendado pelo provedor antes
de usar credenciais de produção. Nenhuma transação real foi realizada nesta entrega.
Tratamento operacional de estornos e pagamentos duplicados ainda exige revisão
manual. As preferências expiram em 24 horas; renovação de checkout vencido não está
disponível neste piloto.

Para interromper novas vendas preservando o acompanhamento, use **Pausada**, não
desabilite globalmente o módulo. Webhooks de pedidos existentes continuam sendo
processados com a loja desativada, desde que `COMMERCE_ENABLED` continue `true` e
as credenciais permaneçam válidas.

## Segurança e operação

- Sessões de comprador com token opaco, hash no banco e cookie HttpOnly separado por tenant.
- Código de login com expiração, limite de tentativas, consumo único e rotação do token.
- Mutações verificam origem, sessão, propriedade do recurso e dados recebidos.
- Novas tabelas com RLS, sem acesso bruto para os papéis públicos do Supabase, e relacionamentos compostos por tenant.
- Checkout transacional, revisão do carrinho e proteção contra duplicação concorrente.
- Limites de requisições e tamanho de arquivos; artes privadas entregues apenas após autorização.
- As rotas usam o acesso de servidor ao Postgres já adotado pelo projeto. Não são uma API para acesso direto do navegador ao banco.

Homologue também as condições de venda, privacidade, prazos e atendimento da loja
com os responsáveis pelo negócio. Não publique o texto de exemplo dos testes.

## Planejado x realizado

- [x] Estrutura opcional, isolamento, catálogo, preços, comprador, carrinho e checkout do piloto.
- [x] Prévia administrativa por tenant, com carrinho, envio/retoque/enquadramento/aprovação e checkout simulados, sem pedidos reais.
- [x] Processamento temporário de imagens autenticado, com limites e geometria obtida no tenant ativo.
- [x] Simulação no navegador em 1365/390/320 px: envio, retoque, enquadramento, aprovação, checkout, retorno ao carrinho e descarte ao recarregar; sem sessão/pedido/arte gravados no banco.
- [x] 245 testes unitários/componentes aprovados, incluindo isolamento e processamento de artes na prévia.
- [x] TypeScript, lint e build local desta etapa aprovados, com um processo de validação por vez.
- [x] Home responsiva, carrosséis de banners/produtos, busca por categoria e temas claro/escuro.
- [x] Fundo próprio para imagens transparentes de produtos em temas claro/escuro, no catálogo, galeria, miniaturas, categorias e carrinho; sem alterar o arquivo original ou o fundo das artes para produção.
- [x] Upload, edição, enquadramento, aprovação e acesso administrativo à produção.
- [x] Pagamento manual e implementação de um provedor online por tenant.
- [x] Testes unitários, de banco e fluxo básico desktop/mobile com dados fictícios.
- [ ] Homologar SMTP, Storage, artes e pagamentos no ambiente real da Ground Shop.
- [ ] Cotação automática, embalagens e etiquetas Melhor Envio no checkout da loja.
- [ ] Sincronização opcional dos pedidos da loja com Olist/ERP e financeiro existente.
- [ ] Assistente criativo público com cotas e consumo de IA por comprador/tenant.
- [x] Upload de logo, capa e imagem de produto com prévia, substituição e remoção da seleção.
- [x] Galeria com até 10 mídias por produto, incluindo até 2 vídeos.
- [ ] Endereço salvo e recuperação de carrinho entre dispositivos.
- [ ] Onboarding OAuth dos vendedores e outros provedores de pagamento.
- [ ] Domínio próprio, DNS/certificado e resolução segura por host.
- [ ] Estoque/reservas, cancelamentos/estornos, outbox, reconciliação periódica e retenção de arquivos.
- [ ] Editor de disposição de seções, métricas de funil e comparação de desempenho em produção.

O planejamento completo continua em `planejamento-ecommerce-multitenant.md`.

## Validação local com pouca memória

Resultado da etapa de prévia simulada: 245 testes da suíte aprovados; os seis testes
de integração com Postgres não foram reexecutados nessa suíte. O teste de navegador
usou um banco local isolado e confirmou o fluxo de artes/checkout sem gravação de
pedidos, artes ou sessões, em desktop e sem overflow horizontal nas telas de
390/320 pixels. Build, lint e TypeScript aprovados. Storage real e pagamento online
não foram acionados nem homologados nesta etapa.

Execute **um comando por vez**:

```bash
npm run test:local
NODE_OPTIONS=--max-old-space-size=768 npm run typecheck
NODE_OPTIONS=--max-old-space-size=768 npm run lint
npm run build:local
```

`test:local` limita o Vitest a um worker. `build:local` limita o heap por processo,
reduz os workers do Next e ativa sua otimização de memória. Não rode build ou testes
junto ao servidor de desenvolvimento e ao navegador automatizado nesta máquina.

Os testes de banco exigem um Postgres local separado, URL em
`COMMERCE_TEST_DATABASE_URL` e banco novo com prefixo `commerce_test_`. O script
`scripts/setup-commerce-test.mjs` cria esse banco e aplica as migrations. Os testes
de integração criam fixtures e devem rodar em uma base nova, nunca no Supabase real.
O script de navegador também exige essa base e Playwright instalado separadamente.

Para repetir a simulação de artes, use `scripts/commerce-preview-browser.mjs` com
`COMMERCE_TEST_DATABASE_URL`, `COMMERCE_TEST_BASE_URL` e `COMMERCE_PLAYWRIGHT_PATH`.
Ele exige as fixtures dos testes de integração, recusa bancos/hosts não locais,
restaura o produto e a publicação alterados para o teste e compara as contagens
de pedidos, artes e sessões antes/depois. As capturas são salvas em `/tmp`.
A suíte comum não executa os seis testes de banco sem uma base nova configurada;
nesta etapa, a verificação com banco foi feita pelo teste de navegador isolado.

## Apresentação dos produtos (07/09/2026)

Referência local: `GroundShop_NuvemShop/static/css/style-async.scss` e
`style-tokens.tpl`. Tratamento aplicado apenas à loja, sem alterar imagens originais,
artes de produção ou o tema administrativo.

- [x] Fundos com iluminação em degradê, distintos nos modos claro e escuro.
- [x] Refinamento: degradês e sombras reproduzem os valores exatos de
  `GroundShop_NuvemShop/static/css/style-tokens.tpl`, sem a adaptação verde anterior.
  O teste de navegador compara os estilos calculados da vitrine e galeria com a referência.
- [x] Sombra no contorno das imagens transparentes e mais respiro na galeria.
- [x] Cards com superfície própria, elevação no hover, foco visível e preço destacado.
- [x] Miniaturas e categorias com o mesmo tratamento de fundo.
- [x] Navegador em 1365, 390 e 320 px: ambos os temas, galeria, transparência,
  ausência de overflow e respeito à preferência por movimento reduzido.
- [x] 14 testes direcionados aprovados, incluindo os seis de integração em banco local novo.
- [x] Lint e build de produção aprovados, incluindo verificação TypeScript.

Regressão visual: `scripts/commerce-surfaces-browser.mjs`, com as mesmas variáveis
de banco/base/Playwright dos scripts acima. Opcionalmente,
`COMMERCE_BROWSER_EXECUTABLE` aponta para um Chromium já instalado.
Não requer migration nem novas configurações para a aplicação.

## Preparação da arte e produto acabado (06/11/2026)

Aplicar `0067_commerce_artwork_proofs.sql` antes de publicar esta versão. Não há
novas variáveis de ambiente. O Storage privado `artwork-production` e o uploader
de imagens da loja continuam sendo utilizados.

Em **Loja online → Produtos → Preparação da arte, benefício e modelo do produto**:

1. Habilite, por produto, a compra com preparação pela equipe. O cliente envia
   a imagem sem precisar editar/aprovar antes de comprar. Produtos existentes
   mantêm o comportamento anterior até essa opção ser ativada.
2. Configure um desconto fixo em reais por arte aprovada pelo cliente e um limite
   percentual por grupo (até 30%). Zero desativa. A aplicação verifica a sessão,
   o produto e as medidas aprovadas no servidor; não confia em preços do browser.
   Uma mesma arte dividida em grupos do mesmo produto recebe o benefício uma vez.
   O frete não recebe esse desconto. O pedido registra o benefício e mantém seu preço.
3. Habilite o modelo do produto. Para cada face, envie **base**, **máscara alfa**
   e **acabamento sobreposto**, com a mesma proporção e enquadramento. PNG/WebP
   transparentes são recomendados, até 3 MB por upload, normalizados pelo uploader.
   Na máscara, somente a área que recebe a arte deve ser opaca; preto/branco
   sem transparência não funciona como máscara alfa. O acabamento fica acima
   da arte: fecho, ímã, abridor, brilho ou sombra do produto real.
4. Ajuste posição/tamanho da região da arte e calibre a faixa da frente e a abertura
   do verso. Use uma arte de teste e compare com a peça física antes de publicar.
   A dobra radial é simulada para modelos circulares. Outros formatos usam máscaras
   planas, sem simular a dobra física. Sem imagens de modelo, a loja mostra uma
   prévia geométrica identificada como esquemática, não uma foto do produto.

A prévia tem frente/verso e ampliação. Usa a arte enquadrada no limite de corte:
a área visível vai até a sangria; a faixa restante continua nas bordas e no verso.
As máscaras e o acabamento **nunca** são incorporados ao arquivo de impressão.
A fidelidade visual depende das imagens e da calibração do modelo de cada produto.

### Preparação interna após a compra

- No pedido administrativo, abra **Preparação e aprovação das artes**. Informe
  a orientação, retoque/enquadre e use **Publicar prova na conta do cliente**.
- A prova fica disponível em **Minha conta → Pedido → Minhas artes e aprovação**.
  Esse botão publica a prova na conta; não envia um e-mail de notificação.
- O comprador revisa a prévia, pode abrir o arquivo exato de impressão e confirma
  a versão. Cada nova edição invalida a aprovação anterior, com registro no histórico.
- Provas em rascunho são privadas. Somente o comprador do pedido pode aprovar.
  A produção e o PDF A4 exigem pagamento confirmado e aprovação de todas as artes.
- Depois de iniciar a produção, a edição fica bloqueada. A aprovação posterior
  de uma arte preparada pela equipe não concede desconto retroativo à compra.

O preview administrativo permite simular os dois modos, o benefício e o acabamento,
mas não gera pedidos reais nem simula a preparação interna posterior a uma compra.

Validação desta etapa: 528 testes aprovados na suíte comum (21 integrações
condicionais não executadas nessa chamada); os 7 testes de integração da loja
foram aprovados separadamente em PostgreSQL local novo com todas as migrations.
TypeScript, lint e build de produção aprovados. Prévia testada por pixels e
capturas em Chromium em 320, 390 e 1440 px, incluindo frente/verso e ampliação.
Storage e pagamentos reais não foram acionados; faltam a configuração e a
homologação dos modelos fotográficos reais de cada produto.

### Modelo Botton baseado na referência de 2,5 cm

Em **Preparação da arte, benefício e modelo do produto**, use **Aplicar modelo
Botton** e depois salve a loja. Isso seleciona seis camadas já alinhadas, sem
alterar a preparação, o desconto nem as medidas físicas de impressão do produto.
O modelo é oferecido somente para formatos circulares (ou ainda não configurados).

Os arquivos ficam em `public/mockups/botton-25mm-v1/`, com 1254 × 1254 px, fundo
transparente e menos de 3 MB cada. **Baixar camadas PNG** fornece o ZIP com as duas
bases, duas máscaras, dois acabamentos, calibração JSON e os prompts de geração.
As máscaras podem ser utilizadas também pelo uploader existente.

As bases foram reconstruídas pelo `image_gen` embutido a partir de `botton25mm.webp`,
sem os textos da referência, pois as duas faces originais estavam sobrepostas.
As máscaras técnicas e os acabamentos vetoriais são gerados por
`node scripts/build-botton-masks.mjs`, sem modificar as fotografias-base.
No verso a máscara é vazada para preservar o metal e o alfinete.

Esse é um modelo visual inicial, não uma medição física certificada. Confira os
fechos e a largura da dobra em cada tamanho de botton antes de publicar. Para
outros acabamentos (ímã/abridor), cadastre as camadas correspondentes; não use o
verso com alfinete como se representasse esses produtos. Não exige nova migration
ou variável de ambiente. Os demais tipos de mídia continuam aceitando somente
URLs HTTPS; a exceção relativa permite apenas os seis arquivos deste modelo.

Validação do modelo: 14 testes direcionados e 533 testes na suíte completa
aprovados (21 integrações condicionais não executadas nesta etapa), TypeScript,
lint e build de produção aprovados. Pixels e capturas conferidos em 320/390/1440 px,
incluindo transparência e preservação do metal/alfinete no verso. ZIP verificado.

### Celebração da arte aprovada e composição do desconto

Depois de preparar e aprovar uma arte, o comprador recebe uma confirmação com
o valor efetivamente calculado no servidor para essa arte e seleção, já limitado
pelo teto percentual. Havendo benefício positivo em uma nova aprovação, uma
explosão breve de confetes, brilho e fitas celebra a conclusão. Sem desconto ou
com preço indisponível, a aprovação é confirmada sem prometer dinheiro.

Na página do produto, a confirmação informa que o benefício acompanha a seleção
ao adicionar ao carrinho; quando preparada no carrinho, já compõe seu total. Carrinho,
checkout e pedido exibem produtos antes do benefício, desconto por arte pronta,
entrega e total, sem subtrair o desconto uma segunda vez. O valor continua sujeito
às quantidades e políticas vigentes até a confirmação do pedido.

A aprovação é idempotente. Repeti-la não concede desconto adicional nem repete
a celebração para a mesma arte aberta no estúdio. A aprovação não é perdida se
a atualização visual do carrinho falhar; nesse caso a confirmação pede atualização.
Uma arte enviada à equipe e aprovada depois da compra não recebe benefício
retroativo. O comportamento dos estúdios de orçamento e produção não foi alterado.

As partículas não recebem foco nem cliques, são removidas automaticamente e não
são exibidas com preferência por movimento reduzido. O preview privado permite
testar a mesma experiência sem cobrança. Sem migration ou variável adicional.

Validação: 549 testes aprovados (21 integrações condicionais não executadas),
TypeScript, lint e build aprovados. Conferência em navegador a 320/390/1440 px,
com e sem movimento reduzido, incluindo descarte das partículas, ausência de
rolagem horizontal e composição do total sem desconto duplicado.

### Faturamento e recebimento no checkout

O checkout coleta nome completo/razão social, CPF/CNPJ válido, e-mail de faturamento,
telefone e endereço fiscal também para pedidos com retirada pessoalmente. O tipo
de pessoa é identificado pelo documento. Esses dados não alteram nome, e-mail ou
acesso da conta autenticada e não são enviados automaticamente ao ERP.

Em **Como deseja receber?**, a entrega usa por padrão os dados de faturamento.
Alterações neles aparecem no endereço compartilhado. **Outro destinatário ou
endereço** abre o formulário de entrega, inicialmente preenchido com os dados
fiscais, com a opção de informar "Aos cuidados de". Alternar entre os modos preserva
as edições do destinatário. Cada formulário possui sua própria consulta de CEP;
as respostas não substituem campos que o usuário editou durante a consulta.

No servidor, o endereço compartilhado é derivado dos dados fiscais validados;
um endereço conflitante enviado pelo navegador não substitui essa escolha.
Retirada pessoalmente não grava um endereço de entrega. Faturamento e recebimento
são preservados no snapshot do pedido e exibidos ao comprador e ao administrador.
Pedidos antigos sem dados fiscais continuam legíveis, sem criar dados presumidos.

O preview exige os mesmos campos e oferece **Preencher dados de teste**, sem criar
pedidos reais. Não há nova migration ou variável: os dados usam o JSON existente
em `commerce_orders.snapshot`. A API de checkout passa a exigir `billing` e
`deliveryAddressSameAsBilling`; as APIs de agentes/orçamentos não foram alteradas.

Validação: 560 testes aprovados na suíte comum (22 integrações condicionais não
executadas nessa chamada), mais 8 integrações da loja em PostgreSQL local novo.
Tipos, lint e build aprovados. Navegador conferido em 320/390/1440 px, temas claro
e escuro, com endereço compartilhado, destinatário diferente e consulta de CEP
atrasada. Nenhum pedido, pagamento ou consulta de CEP real foi executado.
