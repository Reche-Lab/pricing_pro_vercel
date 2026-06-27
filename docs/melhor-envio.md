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
POST /api/melhor-envio/refresh-token
```

Observacao: o callback OAuth completo ainda depende da tela de configuracoes de integracao e persistencia automatica do novo token.

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
```

Esses endpoints recebem `payload` e repassam para o Melhor Envio. O payload final depende dos dados completos de remetente, destinatario, produtos, servico e pedido.

As rotas com `shipmentId` tambem persistem `raw_payload`, `raw_response` e status em `shipments`.

### Payload base por orcamento

```txt
GET /api/quotes/:quoteId/melhor-envio/payload
```

Monta um rascunho de payload para carrinho usando dados do remetente em `/settings`, dados do cliente, itens do orcamento e o servico do primeiro shipment Melhor Envio vinculado.

A resposta inclui `missingFields` para mostrar o que ainda precisa ser preenchido antes da compra da etiqueta. Por enquanto `volumes` continua pendente porque a embalagem final escolhida ainda nao fica persistida no shipment.

### Etiquetas

```txt
POST /api/melhor-envio/generate
POST /api/melhor-envio/print
POST /api/shipments/:shipmentId/melhor-envio/generate
POST /api/shipments/:shipmentId/melhor-envio/print
```

Tambem recebem `payload`, pois a estrutura exata depende dos IDs dos envios comprados.

### Rastreio

```txt
POST /api/melhor-envio/tracking
POST /api/shipments/:shipmentId/melhor-envio/tracking
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

Na tela `/quotes/:quoteId`, os shipments vinculados ao orcamento exibem acoes para executar carrinho, checkout, gerar etiqueta, imprimir etiqueta e rastrear.

## Pendencias para produto final

- Persistir a embalagem/volume final no shipment para preencher `volumes` automaticamente.
- Criar tela de compra e pagamento da etiqueta.
- Criar callback OAuth para persistir tokens automaticamente.
- Criar jobs/retries para rastreio.
