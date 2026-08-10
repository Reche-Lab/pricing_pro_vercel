# Produção de Artes

## Objetivo

O módulo transforma as imagens vinculadas aos itens de um orçamento em arquivos prontos para produção. A etapa criativa pode usar OpenRouter, mas medidas físicas, resolução, sangria, corte e distribuição A4 são sempre calculados localmente pelo servidor.

## Fluxo do usuário

1. Cadastre em `Produtos` o formato e as dimensões finais de impressão da variante em milímetros.
2. Anexe uma imagem ao item do orçamento, envie uma referência diretamente pelo assistente ou crie uma arte do zero.
3. Abra `Itens > Produção de artes` no orçamento.
4. Clique em `Enquadrar` e ajuste zoom, posição e rotação com as áreas de corte e segurança visíveis. O deslocamento horizontal e vertical funciona independentemente do zoom, inclusive em `1x`. O zoom pode ficar abaixo de `1x`; nesse caso, a região do corte sem imagem recebe fundo branco.
5. Confira o alerta de qualidade, informe quantas cópias pertencem à arte e aprove a versão.
6. Quando houver várias artes no item, distribua exatamente a quantidade vendida entre elas.
7. Clique em `Visualizar folhas` para revisar as páginas A4 antes da geração definitiva.
8. Baixe o PDF e, depois da produção física, marque o lote como impresso.

Antes de visualizar ou baixar as folhas, o controle `Linhas de corte` permite incluir ou remover os círculos de corte somente para aquele PDF. A configuração do tenant continua sendo usada como padrão e não é alterada por essa escolha. O snapshot do lote registra se as linhas foram incluídas.

## Aprovação pelo link público

O cliente que recebe o link público do orçamento também pode revisar as artes sem possuir usuário interno. O acesso fica limitado ao orçamento associado ao token e permanece disponível somente enquanto o link estiver válido e o orçamento estiver aguardando decisão.

No `Estúdio de aprovação das artes`, o cliente pode:

- comparar as versões de cada produto;
- enviar uma imagem PNG, JPEG ou WebP como referência;
- criar uma arte do zero ou solicitar alterações sobre uma versão existente;
- reenquadrar a imagem no formato de corte do produto e conferir a área segura;
- selecionar e aprovar uma única versão por produto;
- aceitar ou recusar o orçamento após concluir a revisão.

A arte original nunca é sobrescrita. A aprovação de uma versão desmarca as demais versões do mesmo produto. Para itens personalizados, o aceite final do orçamento é bloqueado enquanto não houver uma arte preparada e aprovada. Todas as ações públicas são auditadas sem expor uma sessão interna do tenant.

O PDF mantém escala física, quantidade de cada item, margens, espaçamento, sangria e o contorno exato das linhas de corte. Círculos iguais podem usar distribuição alternada. Os demais formatos usam organização por linhas, com rotação de 90° somente quando ela estiver habilitada no produto e melhorar o aproveitamento da folha.

## Formatos de produto

Cada variante pode ter sua própria geometria de impressão. O cadastro e a edição de produtos permitem definir:

- circular, quadrado, retangular, triangular ou hexagonal;
- largura e altura finais, sem sangria;
- cantos retos ou arredondados e o raio do arredondamento;
- orientação de triângulos e hexágonos;
- permissão para girar a peça em 90° durante a montagem A4.

Esses dados pertencem à variante e, portanto, ficam isolados por tenant. A geometria usada na preparação é gravada como snapshot da arte, preservando o orçamento mesmo que o cadastro do produto seja alterado depois. Produtos antigos que possuem somente `print_diameter_mm` continuam sendo interpretados como circulares.

## Configuração

Em `Configurações > Produção de artes e impressão` podem ser alterados:

- tamanho da folha;
- margem externa;
- sangria;
- área segura;
- espaço entre artes;
- resolução em DPI;
- distribuição automática, em grade ou alternada;
- exibição das linhas de corte.

Os padrões são A4 (`210 x 297 mm`), margem de `7 mm`, sangria de `2 mm`, área segura de `2 mm`, intervalo de `2 mm` e `300 DPI`.

## OpenRouter

Variáveis necessárias:

```env
OPENROUTER_API_KEY=""
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
OPENROUTER_TEXT_MODEL="openai/gpt-4.1-mini"
OPENROUTER_IMAGE_MODEL="openai/gpt-image-1"
```

`Sugerir direção` usa o modelo de texto para devolver conceito, composição, paleta, tipografia e cuidados de produção. O usuário pode escolher qualquer arte do item como base ou enviar uma imagem PNG, JPEG ou WebP de até 3 MB diretamente pelo assistente. Ao gerar com uma referência, a instrução pede que o modelo preserve tudo o que não foi explicitamente alterado. Toda geração recebe explicitamente o formato geométrico, a largura, a altura, o acabamento dos cantos e a orientação configurados na variante.

Cada item de orçamento possui um limite de solicitações de geração de imagem por IA. O padrão é 3, mas o Superadmin pode definir um valor diferente para cada tenant em `Superadmin > Tenants > Assistente criativo`; zero desativa a geração. O contador é compartilhado entre a área interna e o link público e é persistido no banco, portanto recarregar a página não reinicia o limite. Pedir sugestões textuais, enviar arquivos e reenquadrar artes não consome tentativas. Uma tentativa é consumida quando a solicitação de geração é reservada e enviada ao provedor, inclusive se o provedor falhar depois desse ponto, pois a chamada pode ter gerado custo.

Cada geração é salva como uma nova arte pendente e nunca sobrescreve a original. A versão criada fica selecionada como referência para a próxima solicitação, permitindo ajustes sucessivos até a aprovação. O modelo configurado deve aceitar geração e edição de imagem com entrada de referência.

## Supabase Storage

A migration `0037_artwork_production_workflow.sql` cria o bucket privado `artwork-production`. Configure somente no servidor local e na Vercel:

```env
SUPABASE_URL="https://SEU-PROJETO.supabase.co"
SUPABASE_SERVICE_ROLE_KEY=""
```

Nunca exponha a chave `service_role` com prefixo `NEXT_PUBLIC_`. Originais, artes preparadas e PDFs de produção novos são enviados ao bucket. Arquivos antigos em `data_url` continuam legíveis e podem ser migrados gradualmente.

## Regras de segurança e qualidade

- A chave OpenRouter existe somente no servidor.
- Prompts e imagens não são escritos nos logs da integração.
- Uma geração de IA nunca segue diretamente para o PDF.
- Várias artes podem ser aprovadas no mesmo item, desde que a soma das cópias corresponda à quantidade vendida.
- Repreparar uma arte remove sua aprovação anterior.
- Todas as preparações e aprovações geram eventos em `audit_logs`.
- Uma imagem abaixo da resolução necessária recebe alerta, mas pode ser aprovada conscientemente.
- O assistente criativo recebe o formato e a proporção física do produto; ele não presume mais que toda arte seja circular.

## Endpoints internos

- `GET /api/quotes/:quoteId/production`
- `POST /api/quotes/:quoteId/items/:itemId/artworks/:artworkId/prepare`
- `POST /api/quotes/:quoteId/items/:itemId/artworks/:artworkId/approval`
- `POST /api/public/quotes/:token/items/:itemId/artworks`
- `POST /api/public/quotes/:token/items/:itemId/artworks/ai`
- `POST /api/public/quotes/:token/items/:itemId/artworks/:artworkId/prepare`
- `POST /api/public/quotes/:token/items/:itemId/artworks/:artworkId/approval`
- `POST /api/quotes/:quoteId/items/:itemId/artworks/ai`
- `GET /api/quotes/:quoteId/production/pdf`
- `GET /api/quotes/:quoteId/production/pdf?preview=1`
- `PATCH /api/quotes/:quoteId/production/jobs/:jobId`
- `PUT /api/settings/artwork-production`

Todos exigem sessão autenticada e respeitam o tenant da sessão. Operações de escrita também respeitam o bloqueio de cobrança.

## Evoluções recomendadas

- marcas de registro e barras de controle de cor configuráveis;
- fila assíncrona para lotes muito grandes;
- histórico visual completo entre versões de uma mesma arte.
