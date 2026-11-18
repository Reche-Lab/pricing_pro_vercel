# Métricas da Loja e Google Analytics 4

## Escopo e Checklist

- [x] Configuração GA4 independente por tenant, desativada por padrão, ID validado e acesso administrativo. Salvar as métricas não publica a loja nem altera o catálogo/pagamentos.
- [x] Consentimento opcional por loja, recusa e revisão da escolha; nenhum script/ping Google antes de aceitar. Prévia privada e pedidos de teste não enviam eventos. Sinais DNT/GPC são respeitados.
- [x] Eventos de catálogo, produto, carrinho, identificação, frete, checkout, orçamento e compra confirmada, sem dados de cadastro, artes ou termos de pesquisa. Apenas categorias de aquisição fechadas são aceitas da URL, nunca parâmetros livres.
- [x] Deduplicação de eventos de negócio no navegador, `transaction_id` estável e valores em BRL provenientes dos cálculos do servidor. Falhas no Google não interrompem compra/orçamento.
- [x] Dashboard operacional por tenant: recebimentos, pedidos pendentes, orçamentos salvos, rascunhos com/sem login e carrinhos sem conclusão, com filtros e definições explícitas. Gráfico diário interativo, produtos em pedidos pagos e layout responsivo.
- [x] Migração incremental, isolamento de tenant e CSRF. Cinco testes executados em PostgreSQL 16 vazio/descartável local: migration, reaplicação, auditoria, produção/teste, datas de atividade, totais, séries e exclusão de carrinho com orçamento salvo.
- [x] TDD e regressão global: 1.173 testes aprovados; 87 integrações condicionais ignoradas nessa execução (os cinco testes SQL novos foram executados separadamente). Lint sem avisos, tipos e `git diff --check` aprovados.
- [x] Navegador em 1440/390/320 px: painel/configuração, recusa/aceitação, inclusão no carrinho, checkout e compra confirmada, sem repetição ao recarregar. Chamadas Google interceptadas; nenhum dado enviado a serviços externos. Capturas inspecionadas, sem overflow.
- [x] Build de produção aprovado com uma CPU e heap de 1 GB (`npm run build:local`); rota administrativa incluída. PostgreSQL e servidores de teste descartáveis encerrados.

## Fontes Diferentes

O painel interno consulta pedidos, sessões e orçamentos do banco. Não é uma cópia dos relatórios GA4. Visitas, origens de tráfego e eventos de navegação dependem do consentimento, bloqueadores e recebimento pelo Google; consulte esses relatórios no GA4. Não calcular uma taxa de conversão misturando visitantes consentidos com todos os pedidos do banco.

Orçamentos completos exigem identificação por e-mail. Rascunhos com produtos na jornada de orçamento, sem login, não são documentos emitidos. Carrinhos sem alterações por um prazo configurável são candidatos a abandono, não vendas perdidas confirmadas. Nenhum contato ou remarketing é disparado automaticamente.

## Ativação

1. Aplicar **`supabase/migrations/0081_commerce_analytics.sql` antes do deploy**. Não há variável de ambiente, dependência npm de produção ou credencial Google nova.
2. No GA4, criar/escolher uma propriedade e um fluxo Web para o domínio público da loja. Copiar o **ID de medição `G-…`**, não o Stream ID numérico. Cada tenant deve usar seu próprio fluxo/propriedade.
3. No fluxo, desligar a medição otimizada automática: a aplicação controla os eventos explicitamente. Ativar a redação de e-mails/parâmetros sensíveis. Revisar a política de privacidade e a base de tratamento com o responsável da empresa.
4. Na plataforma: **Loja online → Métricas e GA4 → Configurar GA4**. Informar o ID de medição; o ID numérico da propriedade é opcional, apenas para o atalho ao relatório. Confirmar a revisão de privacidade/coleta automática e ativar. Salvar.
5. Para validar, ligar temporariamente o modo DebugView, visitar a loja publicada em ambiente de produção e aceitar as métricas opcionais. Não testar compras reais apenas para gerar eventos: navegar, visualizar produto/carrinho e iniciar checkout já valida a instrumentação. Usar uma propriedade de homologação quando necessário. O modo de pagamento de teste e a prévia privada ficam excluídos.
6. Criar dimensões personalizadas de evento para `customer_state` e `journey`, se desejado. No GA4, montar explorações distintas de compra e orçamento. Marcar `quote_created` como evento principal apenas se fizer sentido como lead; não confundir com a conversão `purchase`.
7. Desligar DebugView depois de validar. Reavaliar filtros de tráfego interno/desenvolvimento na propriedade. Não instalar GA4/GTM novamente sobre esta instrumentação.

## Contrato de Eventos

| Etapa | Evento | Critério |
|---|---|---|
| Página/catálogo/produto | `page_view`, `view_item_list`, `select_item`, `view_item` | Navegação/seleção; listas refletem os produtos apresentados |
| Pesquisa | `catalog_search` | Quantidade de resultados, sem o texto digitado |
| Carrinho | `add_to_cart`, `remove_from_cart`, `view_cart` | Alteração aceita e recuperada do servidor; envia a diferença, não todo o carrinho como nova inclusão |
| Identificação | `login` | Código de e-mail validado; sem e-mail/nome ou ID do comprador |
| Orçamento | `quote_start`, `quote_review`, `quote_created` | Início consentido, revisão válida e criação aceita no servidor são etapas diferentes |
| Documento/retomada | `quote_pdf_download`, `quote_restored` | Clique para solicitar PDF (não prova de download concluído) e recuperação aceita |
| Artes | `artwork_uploaded`, `artwork_approved` | Operações confirmadas, sem arquivo, imagem, nome da arte ou descrição |
| Entrega | `shipping_quote`, `add_shipping_info` | Cotação retornada/entrega informada; sem CEP, endereço ou destinatário |
| Compra | `begin_checkout`, `add_payment_info`, `order_created` | Início, meio selecionado aceito e criação do pedido; não significam pagamento |
| Pagamento | `purchase` | Pedido de produção retornado pelo servidor com `payment_status=paid`; ID estável da transação, frete separado do valor dos produtos |

Parâmetros públicos: itens com ID/nome do catálogo, quantidade, preço, moeda BRL e valores calculados; `customer_state=guest|identified|unknown`, `journey=quote|purchase`, meio `pix|card|wallet|manual` e entrega `delivery|pickup`, conforme a etapa. Inclusões/remoções parciais usam o preço médio atual dos grupos do produto na respectiva versão do carrinho; o valor de `purchase` é sempre o total efetivamente salvo menos frete, não uma reconstrução pelo catálogo atual.

## Privacidade e Cobertura

- Implementação de consentimento básico: antes da aceitação, não se carrega o Google tag, não se envia ping e não se acumula uma fila histórica de navegação. A escolha dura até 180 dias. Recusar não afeta carrinho, acesso ou orçamento.
- A preferência e os controles são separados por loja. Cookies GA usam prefixo e caminho próprios; anúncios, personalização e Google Signals ficam desativados. O usuário pode rever a escolha em **Privacidade e cookies**, no rodapé. Revogar bloqueia novos eventos e remove apenas os cookies de métricas desta loja.
- Localizações são reconstruídas: sem query livre, hash ou ID de pedido/orçamento. Produtos usam somente o slug público. Referrer contém apenas a origem. `utm_source` aceita `google|bing|facebook|instagram|whatsapp|newsletter` e `utm_medium` aceita categorias fechadas de mídia. `utm_campaign`, `gclid`, outros identificadores e termos livres não são enviados; atribuição detalhada de campanhas fica limitada nesta entrega.
- Não se enviam CPF/CNPJ, telefone, e-mail, nome do comprador, destinatário, CEP, endereço, conteúdos de formulários, arquivos ou nomes das artes. Não há `user_id`, coleta aprimorada de dados fornecidos pelo usuário nem remarketing automático.
- O ID `G-…` é público por definição, não uma senha. O painel usa sessão administrativa, escopo do tenant no servidor e proteção de origem nas alterações; não há endpoint público para consultar dados comerciais de outro tenant.
- O evento `purchase` usa estado confirmado no servidor, mas a entrega ao GA4 depende de visita/atualização da tela do pedido com consentimento. Se o comprador não voltar, bloquear scripts ou recusar, o GA4 pode não receber a conversão. Os valores do painel interno continuam independentes disso. Deduplicação local por sessão e `transaction_id` não são uma garantia de entrega exatamente uma vez entre todos os dispositivos.

## Definições do Painel

- Períodos de 7, 30 ou 90 dias civis, em `America/Sao_Paulo`. Pedidos/orçamentos são selecionados pela data de criação. O recebido representa pedidos desse período que estão pagos agora, não um extrato por data de liquidação. Pedidos excluídos/estornados não entram como recebidos.
- Produção é o padrão. Testes são separados. Orçamentos antigos sem ambiente identificável ficam em `unknown` e aparecem em **Todos, inclusive históricos**, sem serem inventados como vendas de produção.
- Carrinhos são sessões com produtos e última alteração no período; não representam pessoas únicas e podem incluir sessões expiradas. Rascunhos de orçamento são um subconjunto desses carrinhos, segundo o modo da última edição de itens pela loja; não somar as duas populações.
- Possível abandono usa o prazo configurado (padrão 24 h), intenção de compra e ausência de pedido na mesma revisão ou orçamento salvo com os mesmos itens. Não inclui rascunhos classificados como orçamento. Não estima receita perdida e não dispara recuperação comercial.
- A migration não inventa datas de atividade para carrinhos antigos: entram após uma alteração real. Triggers registram alterações de carrinho em todos os caminhos SQL; leituras/no-op não renovam atividade. A configuração de métricas tem auditoria independente.
- Consultas agregadas com índices por tenant/período, sem retornar dados pessoais de compradores ao painel. Dias são pré-agregados antes de preencher a série, evitando uma varredura de pedidos por dia do gráfico.

## Próximas Etapas Opcionais

Esta entrega não configura a conta Google nem importa relatórios da GA4 Data API. Para exibir usuários, origens e funis Google no painel da plataforma, adicionar autorização de leitura por tenant e tratar limites/latência separadamente. Para enviar compras por webhook sem depender de retorno do navegador, projetar Measurement Protocol com consentimento verificável, identificação GA apropriada, segredo protegido no servidor e uma fila transacional/idempotente. Não enviar conversões financeiras sem consentimento nem acrescentar uma segunda fonte que duplique `purchase`.

## Referências

- [Comércio eletrônico no GA4](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- [Referência dos eventos recomendados](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [Configuração de consentimento](https://developers.google.com/tag-platform/security/guides/consent)
- [Configurar um fluxo Web](https://support.google.com/analytics/answer/9304153)
- [Redação de dados no GA4](https://support.google.com/analytics/answer/13544947)
