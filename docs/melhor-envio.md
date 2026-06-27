# Integracao Melhor Envio

## Status

Implementacao backend inicial por tenant.

Credenciais e configuracoes ficam em `integration_connections` com provider `melhor_envio`.

## Configuracao

Para configurar sandbox:

```bash
npm run configure:melhor-envio -- ground-shop 'ACCESS_TOKEN' 'REFRESH_TOKEN' 'CLIENT_ID' 'CLIENT_SECRET' sandbox
```

Para producao:

```bash
npm run configure:melhor-envio -- ground-shop 'ACCESS_TOKEN' 'REFRESH_TOKEN' 'CLIENT_ID' 'CLIENT_SECRET' production
```

Os tokens sao criptografados com `APP_ENCRYPTION_KEY`.

## APIs internas implementadas

### Autenticacao

```txt
GET  /api/melhor-envio/auth-url
GET  /api/melhor-envio/oauth/callback
POST /api/melhor-envio/refresh-token
GET  /api/integrations/melhor-envio
POST /api/integrations/melhor-envio
```

O fluxo OAuth completo fica em `/settings`.

1. Cadastre no aplicativo do Melhor Envio o callback exibido na tela.
2. Salve Client ID e Client Secret.
3. Clique em autorizar aplicativo.
4. O callback troca o `code` por `access_token` e `refresh_token` automaticamente e salva os tokens criptografados por tenant.

O endpoint de refresh tambem persiste o novo access token no banco.

### Cotacao de fretes

```txt
POST /api/shipping/melhor-envio/quote
```

Usa:

- produto/variante;
- quantidade;
- CEP origem;
- CEP destino;
- embalagens cadastradas;
- token do tenant.

### Carrinho e compra

```txt
POST /api/melhor-envio/cart
POST /api/melhor-envio/checkout
POST /api/shipments/:shipmentId/melhor-envio/cart
POST /api/shipments/:shipmentId/melhor-envio/checkout
GET  /api/shipments/:shipmentId/melhor-envio/payload?operation=cart
GET  /api/shipments/:shipmentId/melhor-envio/payload?operation=checkout
```

Esses endpoints recebem `payload` e repassam para o Melhor Envio. O payload final depende dos dados completos de remetente, destinatario, produtos, servico e pedido.

As rotas com `shipmentId` tambem persistem `raw_payload`, `raw_response` e status em `shipments`.

A rota `payload` prepara o JSON sugerido para a operacao escolhida. Para `cart`, ela usa dados do orcamento, remetente, cliente, servico e volumes. Para `checkout`, `generate`, `print` e `tracking`, ela usa os identificadores persistidos no shipment depois das etapas anteriores.

### Payload base por orcamento

```txt
GET /api/quotes/:quoteId/melhor-envio/payload
```

Monta um rascunho de payload para carrinho usando dados do remetente em `/settings`, dados do cliente, itens do orcamento, servico e volumes do primeiro shipment Melhor Envio vinculado.

A resposta inclui `missingFields` para mostrar o que ainda precisa ser preenchido antes da compra da etiqueta e `warnings` para pontos que exigem decisao operacional.

Depois de `supabase/migrations/0008_shipment_packaging_snapshot.sql`, novas cotacoes vinculadas a orcamento persistem:

- `packaging_snapshot`: caixa, dimensoes, quantidade de caixas e peso por caixa;
- `selected_quote`: primeira opcao retornada pelo Melhor Envio, incluindo `packages` quando a API retornar esse campo.

Com esses dados, o payload base passa a preencher `volumes` automaticamente. Se o servico for Correios (`1`, `2` ou `17`) e houver mais de uma caixa, o payload retorna o aviso `correios_multi_volume_requires_separate_labels`, pois esse fluxo exige etiquetas separadas por volume.

### Etiquetas

```txt
POST /api/melhor-envio/generate
POST /api/melhor-envio/print
POST /api/shipments/:shipmentId/melhor-envio/generate
POST /api/shipments/:shipmentId/melhor-envio/print
GET  /api/shipments/:shipmentId/melhor-envio/payload?operation=generate
GET  /api/shipments/:shipmentId/melhor-envio/payload?operation=print
```

Tambem recebem `payload`, pois a estrutura exata depende dos IDs dos envios comprados.

### Rastreio

```txt
POST /api/melhor-envio/tracking
POST /api/shipments/:shipmentId/melhor-envio/tracking
GET  /api/shipments/:shipmentId/melhor-envio/payload?operation=tracking
```

Recebe `payload` com os identificadores de envio/pedido a rastrear.

## Fluxo completo previsto

1. Configurar credenciais Melhor Envio por tenant.
2. Cadastrar produtos, variantes e embalagens.
3. Cotar frete com `/api/shipping/melhor-envio/quote`.
4. Selecionar servico retornado.
5. Criar item no carrinho com `/api/melhor-envio/cart`.
6. Pagar/comprar com `/api/melhor-envio/checkout`.
7. Gerar etiqueta com `/api/melhor-envio/generate`.
8. Imprimir etiqueta com `/api/melhor-envio/print`.
9. Acompanhar com `/api/melhor-envio/tracking`.

Na tela `/quotes/:quoteId`, os shipments vinculados ao orcamento exibem acoes guiadas para executar carrinho, checkout, gerar etiqueta, imprimir etiqueta e rastrear. Cada botao prepara o payload automaticamente, bloqueia a execucao quando houver `missingFields` e mantem uma area de revisao JSON para ajustes manuais quando necessario.

## Pendencias para produto final

- Criar tela de compra e pagamento da etiqueta.
- Validar em sandbox real os retornos de carrinho, checkout, geracao, impressao e rastreio para ajustar os mapeamentos de IDs.
