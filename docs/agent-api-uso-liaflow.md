# Guia de Uso para Agente Lia Flow

Este documento descreve como o agente conversacional da Lia Flow deve acessar o Pricing Pro para consultar produtos, calcular preços, montar orçamentos compostos, calcular frete e devolver uma resposta útil durante a conversa.

## Papel de Cada Sistema

Pricing Pro:

- mantém produtos, canais, curvas de preço e regras de orçamento;
- calcula preço;
- calcula embalagem e frete;
- cria orçamento;
- gera PDF, link público e texto para WhatsApp;
- aciona Olist e Melhor Envio quando permitido.

Lia Flow:

- conversa com o cliente;
- identifica intenção;
- coleta dados que faltam;
- chama as tools do Pricing Pro;
- explica o resultado em linguagem natural;
- confirma ações sensíveis antes de executá-las.

## Configuração Necessária

Para cada tenant que o agente poderá atender:

1. Criar uma API key no Pricing Pro para o agente.
2. Configurar essa chave no ambiente do Lia Flow.
3. Definir o tenant alvo.
4. Definir escopos permitidos.

Depois de rodar a migration `0030_agent_api_keys.sql`, gere uma chave para o tenant:

Pela interface:

1. Acesse `Configurações > Agentes e API`.
2. Clique em `Criar chave`.
3. Copie o token exibido.
4. Salve o token no ambiente do Lia Flow.

Como alternativa operacional, também é possível gerar via script:

```bash
npm run create:agent-key -- ground-shop "Lia Flow Agent"
```

Com escopos customizados:

```bash
npm run create:agent-key -- ground-shop "Lia Flow Agent" "products:read,pricing:calculate,quotes:create,quotes:read,quotes:public_link,quotes:pdf,quotes:whatsapp,shipping:quote"
```

Copie o token exibido e salve no ambiente do Lia Flow. O token não fica recuperável depois.

Variáveis sugeridas no Lia Flow:

```txt
PRICING_PRO_API_BASE_URL="https://liaflow-calcula.vercel.app/api/agent/v1"
PRICING_PRO_API_KEY="pp_agent_live_xxx"
PRICING_PRO_TENANT_SLUG="ground-shop"
```

Header obrigatório em toda chamada:

```txt
Authorization: Bearer pp_agent_live_xxx
Content-Type: application/json
```

Header recomendado para criação:

```txt
Idempotency-Key: {{conversation_id}}:{{message_id}}:{{operation}}
```

## Tools Recomendadas no Agente

### 1. `buscar_produtos`

Quando usar:

- cliente pergunta quais produtos existem;
- cliente escreve algo aproximado como "boton", "chaveirinho", "abridor";
- agente precisa resolver SKU antes de calcular.

Endpoint:

```txt
GET /products/search?q={{termo}}
```

Entrada da tool:

```json
{
  "termo": "botton 3,5"
}
```

Saída esperada:

```json
{
  "ok": true,
  "products": [
    {
      "sku": "BOTTON-35",
      "name": "Botton 3,5 cm",
      "description": "Botton personalizado 3,5 cm"
    }
  ]
}
```

Como o agente deve responder:

```txt
Encontrei Botton 3,5 cm. Qual quantidade você gostaria de cotar?
```

Se houver múltiplas opções:

```txt
Encontrei algumas opções: Botton 2,5 cm, Botton 3,5 cm e Botton 5,5 cm. Qual delas você quer?
```

### 2. `calcular_preco`

Quando usar:

- cliente já informou produto e quantidade;
- ainda não precisa salvar orçamento;
- agente quer responder uma estimativa rápida.

Endpoint:

```txt
POST /pricing/calculate
```

Entrada:

```json
{
  "platformSlug": "whatsapp",
  "pricingRule": "per_item",
  "items": [
    {
      "productSku": "BOTTON-35",
      "quantity": 100,
      "artworkName": "Logo principal"
    }
  ]
}
```

Resposta esperada:

```json
{
  "ok": true,
  "summary": "100 unidades de Botton 3,5 cm por R$ 2,50 cada.",
  "totals": {
    "subtotal": 250,
    "shipping": 0,
    "grandTotal": 250
  }
}
```

Resposta do agente:

```txt
Para 100 unidades de Botton 3,5 cm, o valor fica em R$ 250,00, antes do frete.
Para calcular o frete, pode me passar o CEP de entrega?
```

### 3. `calcular_frete`

Quando usar:

- cliente passou CEP;
- orçamento ainda não precisa ser salvo;
- agente precisa apresentar opções de envio.

Endpoint:

```txt
POST /shipping/quote
```

Entrada:

```json
{
  "customerPostalCode": "04026090",
  "provider": "melhor_envio",
  "strategy": "cheapest",
  "items": [
    {
      "productSku": "BOTTON-35",
      "quantity": 100
    }
  ]
}
```

Resposta esperada:

```json
{
  "ok": true,
  "recommended": {
    "serviceName": "Correios PAC",
    "price": 24.9,
    "deliveryTime": 5
  },
  "options": [
    {
      "serviceName": "Correios PAC",
      "price": 24.9,
      "deliveryTime": 5
    },
    {
      "serviceName": "Correios SEDEX",
      "price": 39.9,
      "deliveryTime": 2
    }
  ]
}
```

Resposta do agente:

```txt
O frete mais econômico ficou em R$ 24,90 por Correios PAC, com prazo estimado de 5 dias úteis.
Também posso seguir com SEDEX por R$ 39,90, com prazo estimado de 2 dias úteis.
Qual opção prefere?
```

### 4. `criar_orcamento_composto`

Quando usar:

- cliente confirmou produto(s), quantidade(s), dados básicos e frete;
- agente precisa salvar o orçamento e retornar link/PDF/texto.

Endpoint:

```txt
POST /quotes/composite
```

Entrada:

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

Resposta esperada:

```json
{
  "ok": true,
  "quoteId": "652dc1a4-3a20-4f5e-84c7-f1dbc5ca89e1",
  "summary": "Orçamento criado com 3 grupos de produtos e frete Melhor Envio.",
  "totals": {
    "subtotal": 120,
    "shipping": 24.9,
    "grandTotal": 144.9
  },
  "publicUrl": "https://liaflow-calcula.vercel.app/q/token",
  "pdfUrl": "https://liaflow-calcula.vercel.app/api/quotes/652dc1a4-3a20-4f5e-84c7-f1dbc5ca89e1/pdf",
  "whatsappText": "Olá, Bruno! Segue seu orçamento..."
}
```

Resposta do agente:

```txt
Pronto, gerei seu orçamento.

Total: R$ 144,90
Frete: R$ 24,90

Você pode visualizar por aqui:
https://liaflow-calcula.vercel.app/q/token

Também posso te enviar o PDF.
```

### 5. `consultar_orcamento`

Quando usar:

- cliente pergunta sobre orçamento anterior;
- agente precisa recuperar link, total, status ou itens.

Endpoint:

```txt
GET /quotes/{{quoteId}}
```

### 6. `obter_texto_whatsapp`

Quando usar:

- agente precisa reenviar orçamento formatado;
- agente quer mandar o texto pronto ao cliente.

Endpoint:

```txt
GET /quotes/{{quoteId}}/whatsapp
```

### 7. `obter_pdf_orcamento`

Quando usar:

- cliente pede PDF;
- agente precisa anexar ou enviar link do PDF.

Endpoint:

```txt
GET /quotes/{{quoteId}}/pdf
```

## Fluxo Conversacional Recomendado

### Cenário: orçamento simples

Cliente:

```txt
Quanto fica 100 bottons 3,5?
```

Agente:

1. chama `buscar_produtos` com "bottons 3,5";
2. identifica `BOTTON-35`;
3. chama `calcular_preco`;
4. responde valor sem frete;
5. pergunta CEP.

Cliente:

```txt
04026-090
```

Agente:

1. chama `calcular_frete`;
2. apresenta opções;
3. pergunta se pode gerar orçamento.

Cliente:

```txt
Pode gerar.
```

Agente:

1. chama `criar_orcamento_composto`;
2. entrega resumo, link público e PDF/texto se solicitado.

### Cenário: orçamento composto com artes

Cliente:

```txt
Quero 10 bottons 2,5 com uma arte, 20 bottons 2,5 com outra arte e 15 bottons 3,5 com uma terceira arte.
```

Agente:

1. reconhece 3 grupos;
2. consulta produtos `BOTTON-25` e `BOTTON-35`;
3. pergunta nomes das artes se necessário;
4. chama `calcular_preco` ou direto `criar_orcamento_composto`;
5. calcula frete se tiver CEP;
6. retorna orçamento consolidado.

## Regras para o Agente

### Dados mínimos para calcular preço

- produto ou descrição suficiente para achar produto;
- quantidade;
- canal/plataforma, se houver mais de um.

### Dados mínimos para criar orçamento

- itens;
- nome do cliente, se possível;
- canal/plataforma;
- telefone ou email, se possível.

### Dados mínimos para frete

- CEP de entrega;
- produtos com medidas/peso cadastrados;
- caixas cadastradas no tenant;
- integração de frete habilitada.

### Quando perguntar ao cliente

Perguntar quando:

- produto estiver ambíguo;
- quantidade não foi informada;
- CEP é necessário para frete;
- houver mais de uma opção de frete e o cliente precisa escolher;
- faltar dado obrigatório para criar cliente no Olist;
- ação for operacional sensível, como emitir nota ou comprar etiqueta.

### Quando não perguntar

Não perguntar quando:

- houver apenas um produto compatível com o termo;
- a estratégia de frete for `cheapest`;
- o cliente já pediu explicitamente para gerar orçamento;
- os dados mínimos já estiverem disponíveis.

## Cuidados de Segurança

O agente não deve:

- receber custo interno do produto;
- receber margem;
- receber token de integração Olist ou Melhor Envio;
- acessar endpoints internos do painel;
- criar pedido Olist, emitir nota ou comprar etiqueta sem confirmação clara.

O agente pode:

- consultar produtos;
- calcular preço;
- calcular frete;
- criar orçamento;
- gerar PDF/link/texto;
- consultar orçamento.

Operações que exigem confirmação explícita:

- criar cliente no Olist;
- criar pedido de venda no Olist;
- enviar para expedição;
- comprar etiqueta Melhor Envio;
- emitir ou cancelar nota fiscal.

## Mensagens de Erro Conversacionais

Se `product_not_found`:

```txt
Não encontrei esse produto cadastrado. Você pode me dizer o tamanho ou mandar o nome de outro jeito?
```

Se `ambiguous_product`:

```txt
Encontrei mais de uma opção. Você quer Botton 2,5 cm, Botton 3,5 cm ou Botton 5,5 cm?
```

Se `missing_customer_postal_code`:

```txt
Para calcular o frete, preciso do CEP de entrega.
```

Se `shipping_provider_not_configured`:

```txt
No momento não consigo calcular o frete automaticamente para essa loja. Posso seguir sem frete ou usar um valor manual informado pela equipe.
```

Se `packaging_not_found`:

```txt
Ainda não há uma embalagem compatível cadastrada para esse produto e quantidade. Posso gerar o orçamento sem frete por enquanto.
```

## Próximas Ações de Implementação

1. Implementar autenticação por API key.
2. Criar `products/search`.
3. Criar `pricing/calculate`.
4. Criar `shipping/quote`.
5. Criar `quotes/composite`.
6. Criar endpoints de saída:
   - WhatsApp;
   - PDF;
   - link público.
7. Configurar as tools no Lia Flow.
8. Fazer teste ponta a ponta em produção com um tenant controlado.
