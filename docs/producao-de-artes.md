# Produção de Artes

## Objetivo

O módulo transforma as imagens vinculadas aos itens de um orçamento em arquivos prontos para produção. A etapa criativa pode usar OpenRouter, mas medidas físicas, resolução, sangria, corte e distribuição A4 são sempre calculados localmente pelo servidor.

## Fluxo do usuário

1. Cadastre em `Produtos` o diâmetro final de impressão da variante em milímetros.
2. Anexe uma imagem ao item do orçamento, envie uma referência diretamente pelo assistente ou crie uma arte do zero.
3. Abra `Itens > Produção de artes` no orçamento.
4. Clique em `Enquadrar` e ajuste zoom, posição e rotação com as áreas de corte e segurança visíveis.
5. Confira o alerta de qualidade, informe quantas cópias pertencem à arte e aprove a versão.
6. Quando houver várias artes no item, distribua exatamente a quantidade vendida entre elas.
7. Clique em `Visualizar folhas` para revisar as páginas A4 antes da geração definitiva.
8. Baixe o PDF e, depois da produção física, marque o lote como impresso.

## Aprovação pelo link público

O cliente que recebe o link público do orçamento também pode revisar as artes sem possuir usuário interno. O acesso fica limitado ao orçamento associado ao token e permanece disponível somente enquanto o link estiver válido e o orçamento estiver aguardando decisão.

No `Estúdio de aprovação das artes`, o cliente pode:

- comparar as versões de cada produto;
- enviar uma imagem PNG, JPEG ou WebP como referência;
- criar uma arte do zero ou solicitar alterações sobre uma versão existente;
- reenquadrar a imagem para o corte circular e conferir a área segura;
- selecionar e aprovar uma única versão por produto;
- aceitar ou recusar o orçamento após concluir a revisão.

A arte original nunca é sobrescrita. A aprovação de uma versão desmarca as demais versões do mesmo produto. Para itens personalizados, o aceite final do orçamento é bloqueado enquanto não houver uma arte preparada e aprovada. Todas as ações públicas são auditadas sem expor uma sessão interna do tenant.

O PDF mantém escala física, quantidade de cada item, margens, espaçamento, sangria e linhas de corte. Para artes do mesmo diâmetro, o modo automático compara a grade com a distribuição alternada. Para diâmetros mistos, utiliza organização por linhas com os maiores itens primeiro.

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

`Sugerir direção` usa o modelo de texto para devolver conceito, composição, paleta, tipografia e cuidados de produção. O usuário pode escolher qualquer arte do item como base ou enviar uma imagem PNG, JPEG ou WebP de até 3 MB diretamente pelo assistente. Ao gerar com uma referência, a instrução pede que o modelo preserve tudo o que não foi explicitamente alterado.

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
