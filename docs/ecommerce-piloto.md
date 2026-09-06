# Loja online opcional: piloto

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

É possível navegar no catálogo, pesquisar produtos, abrir um produto, simular
quantidades/artes e consultar as condições. Não há sessão de comprador, carrinho,
upload de arte ou checkout nessa rota; nenhuma compra ou pagamento é criado.

A prévia mostra **a última versão salva**, não alterações ainda pendentes no
formulário. Depois de editar, salve e atualize a aba da prévia. Ao publicar,
o endereço público continua sendo `/loja/SLUG_DO_TENANT`.

O link não é um token público: exige sessão administrativa com permissão no tenant
ativo. Um administrador de outro tenant não pode usá-lo. Página e API de preços
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
- [x] Prévia administrativa por tenant, com navegação privada e compras bloqueadas.
- [x] Home responsiva, carrosséis de banners/produtos, busca por categoria e temas claro/escuro.
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

Resultado desta entrega: 203 testes da suíte e 5 testes de integração com Postgres
aprovados. Fluxo básico de navegador aprovado em desktop e sem overflow horizontal
nas telas verificadas de 390/320 pixels. Build, lint e TypeScript aprovados. O fluxo
de artes com Storage real e o pagamento online não foram homologados pelo navegador.

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
