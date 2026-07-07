# API para Agentes Conversacionais

Documento técnico para implementar uma camada segura de integração entre o Pricing Pro e agentes conversacionais, começando pelo agente do projeto Lia Flow.

## Objetivo

Permitir que um agente externo consulte produtos, calcule preços, monte orçamentos compostos, calcule frete, gere PDF/texto de WhatsApp e acione integrações operacionais sem acessar diretamente o banco, sem depender da interface web e sem expor dados internos sensíveis.

O Pricing Pro deve funcionar como motor de:

- catálogo de produtos por tenant;
- regras de precificação;
- orçamento composto;
- cálculo de embalagem/frete;
- geração de orçamento, PDF e texto WhatsApp;
- integrações Olist e Melhor Envio quando autorizadas.

O Lia Flow deve funcionar como interface conversacional.

## Princípios

- Toda chamada de agente deve ser autenticada.
- Toda chamada deve resolver um único tenant.
- O agente não deve receber custos internos, margem ou dados sensíveis, salvo escopo explícito.
- Toda escrita deve gerar auditoria.
- Criação de orçamento deve aceitar idempotência para evitar duplicidade por repetição de mensagem.
- Endpoints de agente devem ter contrato estável e respostas amigáveis para conversa.
- APIs internas de tela não devem ser expostas diretamente ao agente.

## Modelo de Autenticação

Criar uma tabela de chaves por tenant:

```sql
create table agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

Formato recomendado do token:

```txt
pp_agent_live_<prefix>_<secret>
```

O banco salva apenas hash do token completo. A API identifica o prefixo, busca a chave e compara hash.

Header:

```txt
Authorization: Bearer pp_agent_live_xxx
```

Headers opcionais:

```txt
Idempotency-Key: liaflow-conversation-message-id
X-Agent-Source: lia-flow
```

## Escopos

Escopos iniciais:

```txt
products:read
pricing:calculate
quotes:create
quotes:read
quotes:public_link
quotes:pdf
quotes:whatsapp
customers:lookup
customers:create
shipping:quote
olist:customer
olist:sales_order
olist:crm
olist:invoice
melhor_envio:quote
melhor_envio:label
```

Escopos mínimos para o primeiro MVP:

```txt
products:read
pricing:calculate
quotes:create
quotes:read
quotes:public_link
quotes:pdf
quotes:whatsapp
shipping:quote
```

## Endpoints Propostos

Base:

```txt
/api/agent/v1
```

### Health

```txt
GET /api/agent/v1/health
```

Retorna tenant, escopos ativos e status.

### Produtos

```txt
GET /api/agent/v1/products
GET /api/agent/v1/products/search?q=botton%203,5
```

Resposta deve conter apenas informações úteis para orçamento:

- `productId`;
- `variantId`;
- `sku`;
- `name`;
- `description`;
- `dimensions`;
- `unitWeightKg`;
- `active`;
- canais disponíveis.

Não retornar custo interno por padrão.

### Simulação de Preço

```txt
POST /api/agent/v1/pricing/calculate
```

Uso quando o agente quer responder rapidamente antes de criar orçamento.

Payload:

```json
{
  "platformSlug": "whatsapp",
  "items": [
    {
      "productSku": "BOTTON-35",
      "quantity": 100,
      "artworkName": "Logo principal"
    }
  ],
  "pricingRule": "per_item"
}
```

Resposta:

```json
{
  "ok": true,
  "summary": "100 unidades de Botton 3,5 cm por R$ 2,50 cada.",
  "items": [
    {
      "sku": "BOTTON-35",
      "description": "Botton 3,5 cm",
      "quantity": 100,
      "unitPrice": 2.5,
      "total": 250
    }
  ],
  "totals": {
    "subtotal": 250,
    "discount": 0,
    "shipping": 0,
    "grandTotal": 250
  },
  "nextActions": ["create_quote", "ask_shipping_postal_code"]
}
```

### Cotação de Frete

```txt
POST /api/agent/v1/shipping/quote
```

Payload:

```json
{
  "customerPostalCode": "04026090",
  "items": [
    {
      "productSku": "BOTTON-35",
      "quantity": 100
    }
  ],
  "provider": "melhor_envio",
  "strategy": "cheapest"
}
```

Regras:

- usar CEP de origem do tenant;
- calcular embalagem inteligente;
- consultar somente provedores habilitados no tenant;
- se Melhor Envio retornar várias opções, retornar todas e destacar recomendada.

Resposta:

```json
{
  "ok": true,
  "recommended": {
    "provider": "melhor_envio",
    "serviceCode": "1",
    "serviceName": "Correios PAC",
    "price": 24.9,
    "deliveryTime": 5
  },
  "options": [
    {
      "provider": "melhor_envio",
      "serviceCode": "1",
      "serviceName": "Correios PAC",
      "price": 24.9,
      "deliveryTime": 5
    }
  ],
  "package": {
    "boxName": "Caixa P",
    "dimensionsCm": "16 x 11 x 4",
    "grossWeightKg": 0.8,
    "boxesNeeded": 1
  }
}
```

### Criar Orçamento Composto

```txt
POST /api/agent/v1/quotes/composite
```

Este é o endpoint principal para o agente.

Payload:

```json
{
  "externalConversationId": "liaflow-thread-123",
  "customer": {
    "name": "Bruno Reche",
    "document": "31352733854",
    "email": "bruno@email.com",
    "phone": "5511999999999",
    "postalCode": "04026090",
    "addressLine": "Rua Exemplo",
    "addressNumber": "123",
    "district": "Centro",
    "city": "São Paulo",
    "state": "SP"
  },
  "platformSlug": "whatsapp",
  "pricingRule": "per_item",
  "items": [
    {
      "productSku": "BOTTON-25",
      "quantity": 10,
      "artworkName": "Logo A"
    },
    {
      "productSku": "BOTTON-25",
      "quantity": 20,
      "artworkName": "Logo B"
    },
    {
      "productSku": "BOTTON-35",
      "quantity": 15,
      "artworkName": "Campanha C"
    }
  ],
  "shipping": {
    "calculate": true,
    "provider": "melhor_envio",
    "strategy": "cheapest"
  },
  "output": {
    "publicLink": true,
    "pdf": true,
    "whatsappText": true
  }
}
```

Resposta:

```json
{
  "ok": true,
  "quoteId": "652dc1a4-3a20-4f5e-84c7-f1dbc5ca89e1",
  "summary": "Orçamento criado com 3 grupos de produtos e frete Melhor Envio.",
  "customer": {
    "name": "Bruno Reche"
  },
  "items": [
    {
      "description": "Botton 2,5 cm - Logo A",
      "quantity": 10,
      "unitPrice": 3.2,
      "total": 32
    }
  ],
  "shipping": {
    "provider": "melhor_envio",
    "serviceName": "Correios PAC",
    "price": 24.9,
    "deliveryTime": 5
  },
  "totals": {
    "subtotal": 120,
    "shipping": 24.9,
    "discount": 0,
    "grandTotal": 144.9
  },
  "publicUrl": "https://liaflow-calcula.vercel.app/q/token",
  "pdfUrl": "https://liaflow-calcula.vercel.app/api/quotes/652dc1a4-3a20-4f5e-84c7-f1dbc5ca89e1/pdf",
  "whatsappText": "Olá, Bruno! Segue seu orçamento..."
}
```

### Consultar Orçamento

```txt
GET /api/agent/v1/quotes/:quoteId
```

Retorna resumo, itens, frete, status, links e próximas ações possíveis.

### Gerar Saídas

```txt
GET /api/agent/v1/quotes/:quoteId/whatsapp
GET /api/agent/v1/quotes/:quoteId/pdf
POST /api/agent/v1/quotes/:quoteId/public-link
```

### Operações Olist e Melhor Envio

Só habilitar depois do MVP básico.

```txt
POST /api/agent/v1/quotes/:quoteId/olist/customer/lookup
POST /api/agent/v1/quotes/:quoteId/olist/customer
POST /api/agent/v1/quotes/:quoteId/olist/sales-order
POST /api/agent/v1/quotes/:quoteId/olist/fulfillment
POST /api/agent/v1/quotes/:quoteId/melhor-envio/label
```

Esses endpoints devem ser protegidos por escopos específicos e sempre retornar mensagens explicáveis para conversa.

## Idempotência

Toda criação deve aceitar `Idempotency-Key`.

Tabela recomendada:

```sql
create table agent_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  api_key_id uuid references agent_api_keys(id) on delete set null,
  idempotency_key text not null,
  request_hash text not null,
  response_body jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
```

Se a mesma chave chegar novamente com o mesmo hash, retornar a resposta salva.

Se chegar com payload diferente, retornar `409`.

## Auditoria

Registrar em `audit_logs`:

- `agent.products.search`;
- `agent.pricing.calculate`;
- `agent.shipping.quote`;
- `agent.quotes.create`;
- `agent.quotes.read`;
- `agent.olist.*`;
- `agent.melhor_envio.*`.

Metadados mínimos:

```json
{
  "source": "lia-flow",
  "apiKeyId": "uuid",
  "conversationId": "thread-id",
  "quoteId": "uuid"
}
```

## Tratamento de Erros

Formato padrão:

```json
{
  "ok": false,
  "error": {
    "code": "missing_customer_postal_code",
    "message": "Para calcular o frete, preciso do CEP de entrega do cliente.",
    "field": "customer.postalCode",
    "recoverable": true
  },
  "nextActions": [
    {
      "type": "ask_user",
      "message": "Qual é o CEP de entrega?"
    }
  ]
}
```

Códigos úteis:

- `unauthorized`;
- `forbidden_scope`;
- `tenant_not_found`;
- `product_not_found`;
- `ambiguous_product`;
- `missing_customer_postal_code`;
- `shipping_provider_not_configured`;
- `packaging_not_found`;
- `quote_creation_failed`;
- `external_integration_failed`.

## MVP Recomendado

### Fase 1

- [x] migration `agent_api_keys`;
- [x] autenticação `Authorization: Bearer`;
- [x] `GET /api/agent/v1/products/search`;
- [x] `POST /api/agent/v1/pricing/calculate`;
- [x] `POST /api/agent/v1/shipping/quote`;
- [x] `POST /api/agent/v1/quotes/composite`;
- [x] `GET /api/agent/v1/quotes/:quoteId/whatsapp`;
- [x] `GET /api/agent/v1/quotes/:quoteId/pdf`.
- [x] tela em Configurações para gerar e revogar chave.

### Fase 2

- idempotência persistida;
- endpoint de consulta de orçamento;
- link público automático.

### Fase 3

- Olist;
- Melhor Envio etiqueta;
- logs detalhados por conversa;
- limites por minuto/dia.

## Testes

Criar testes unitários para:

- autenticação da API key;
- escopos;
- resolução de produto por SKU/nome;
- criação de orçamento composto;
- cálculo de frete com embalagem;
- idempotência;
- erros recuperáveis.

Criar testes de contrato para payloads esperados pelo Lia Flow.
