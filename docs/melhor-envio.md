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
```

Esses endpoints recebem `payload` e repassam para o Melhor Envio. O payload final depende dos dados completos de remetente, destinatario, produtos, servico e pedido.

### Etiquetas

```txt
POST /api/melhor-envio/generate
POST /api/melhor-envio/print
```

Tambem recebem `payload`, pois a estrutura exata depende dos IDs dos envios comprados.

### Rastreio

```txt
POST /api/melhor-envio/tracking
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

## Pendencias para produto final

- Modelar endereco completo do tenant/remetente.
- Modelar endereco completo do cliente/destinatario.
- Salvar shipment/etiqueta no banco.
- Vincular shipment a `quotes`.
- Criar tela de compra e pagamento da etiqueta.
- Criar callback OAuth para persistir tokens automaticamente.
- Criar jobs/retries para rastreio.

