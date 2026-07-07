# Prompt para Desenvolvimento da Integração Lia Flow + Pricing Pro

Use este prompt no agente de desenvolvimento do projeto Lia Flow para criar o módulo de integração com o Pricing Pro.

## Prompt

Você é um agente de desenvolvimento trabalhando no projeto Lia Flow. Sua tarefa é criar um módulo completo de integração com o Pricing Pro, para que agentes conversacionais consigam consultar produtos, calcular preço, calcular frete, criar orçamentos compostos, gerar texto para WhatsApp, gerar PDF e criar link público de aceite.

O Pricing Pro é o motor de precificação e orçamento. O Lia Flow é a interface conversacional. O Lia Flow não deve acessar o banco do Pricing Pro diretamente e não deve chamar rotas internas da interface web. Use somente a API pública para agentes.

## Objetivo

Criar uma integração robusta, segura e testada entre o Lia Flow e o Pricing Pro, com:

- autenticação por Bearer token;
- cliente HTTP dedicado;
- tools/funções reutilizáveis pelo agente conversacional;
- tratamento humanizado de erros;
- idempotência em operações de escrita;
- testes unitários e de integração com mocks;
- fluxo conversacional claro para orçamento simples e orçamento composto.

## Configuração

Adicione as seguintes variáveis de ambiente ao Lia Flow:

```txt
PRICING_PRO_API_BASE_URL="https://liaflow-calcula.vercel.app/api/agent/v1"
PRICING_PRO_API_KEY="pp_agent_live_xxx"
PRICING_PRO_DEFAULT_PLATFORM_SLUG=""
PRICING_PRO_AGENT_SOURCE="lia-flow"
```

A chave `PRICING_PRO_API_KEY` deve ser criada no Pricing Pro em:

```txt
Configurações > Agentes e API
```

Escopos mínimos necessários para a chave:

```txt
products:read
pricing:calculate
shipping:quote
quotes:create
quotes:read
quotes:whatsapp
quotes:pdf
quotes:public_link
```

## Headers

Todas as chamadas devem enviar:

```txt
Authorization: Bearer ${PRICING_PRO_API_KEY}
X-Agent-Source: lia-flow
```

Chamadas `POST` também devem enviar:

```txt
Content-Type: application/json
Idempotency-Key: ${conversationId}:${messageId}:${operationName}
```

Use `Idempotency-Key` principalmente em:

- `POST /quotes/composite`
- `POST /quotes/:quoteId/public-link`

Não use idempotência baseada apenas no horário, pois mensagens repetidas podem criar orçamentos duplicados.

## Endpoints Disponíveis

Base URL:

```txt
${PRICING_PRO_API_BASE_URL}
```

### Health

```txt
GET /health
```

Use para validar credenciais e disponibilidade.

### Listar Produtos

```txt
GET /products?limit=25
```

Use quando o agente precisar listar opções disponíveis.

### Buscar Produtos

```txt
GET /products/search?q=botton%203,5&limit=10
```

Use sempre que o usuário informar um produto por nome aproximado. Não invente SKU. Se houver múltiplos resultados, peça para o usuário escolher.

### Calcular Preço

```txt
POST /pricing/calculate
```

Importante:

- `platformSlug` é opcional.
- Se o Lia Flow não tiver certeza do canal cadastrado no Pricing Pro, omita `platformSlug` para usar o canal padrão do tenant.
- Só envie `platformSlug` quando ele existir em `Configurações > Canais`. Na configuração inicial da Ground Shop, `direct` representa venda direta/WhatsApp.

Payload:

```json
{
  "platformSlug": "direct",
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

Também aceite itens resolvidos por `productVariantId` quando o endpoint de busca retornar esse identificador.

Use para simular preço antes de salvar o orçamento.

### Calcular Frete

```txt
POST /shipping/quote
```

Payload:

```json
{
  "customerPostalCode": "04026090",
  "insuranceValue": 250,
  "items": [
    {
      "productSku": "BOTTON-35",
      "quantity": 100
    }
  ]
}
```

Regras do fluxo:

- solicite o CEP antes de calcular frete;
- use o CEP de origem configurado no tenant do Pricing Pro;
- deixe o Pricing Pro escolher embalagem, peso e provedor habilitado;
- apresente as opções de envio retornadas;
- se o cliente escolher uma opção, preserve essa escolha para criar o orçamento.

### Criar Orçamento Composto

```txt
POST /quotes/composite
```

Payload recomendado:

```json
{
  "externalConversationId": "liaflow-thread-123",
  "customer": {
    "name": "Bruno Reche",
    "document": "31352733854",
    "email": "bruno@email.com",
    "phone": "+55 11 99999-9999",
    "postalCode": "04026090",
    "addressLine": "Rua Exemplo",
    "addressNumber": "123",
    "addressComplement": "Apto 10",
    "district": "Centro",
    "city": "São Paulo",
    "state": "SP"
  },
  "platformSlug": "direct",
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
    "strategy": "cheapest"
  },
  "output": {
    "publicLink": true,
    "pdf": true,
    "whatsappText": true
  }
}
```

Antes de chamar este endpoint, confirme com o usuário:

- produto;
- quantidade;
- nome de cada arte/lote, quando houver;
- nome do cliente;
- CEP, se o orçamento tiver frete;
- opção de frete escolhida, quando houver mais de uma.

### Ler Orçamento

```txt
GET /quotes/:quoteId
```

Use para recuperar o orçamento já criado, conferir status e apresentar resumo.

### Texto para WhatsApp

```txt
GET /quotes/:quoteId/whatsapp
```

Use o texto retornado como resposta pronta para o usuário ou para envio por WhatsApp. Trate de forma defensiva o nome do campo retornado, aceitando `text`, `message` ou `whatsappText`.

### PDF

```txt
GET /quotes/:quoteId/pdf
```

Este endpoint retorna um PDF binário e exige autenticação. Não exponha esta URL diretamente ao cliente final. Se precisar enviar o PDF pelo Lia Flow, baixe o arquivo usando o Bearer token, armazene/anexe pelo mecanismo de mídia do Lia Flow e envie o arquivo ao usuário.

Para compartilhamento simples com cliente, prefira `publicPdfUrl`, retornado na criação do orçamento quando `output.publicLink` e `output.pdf` estiverem ativos. Esse link segue o formato:

```txt
https://liaflow-calcula.vercel.app/q/{{token}}/pdf
```

Campos esperados na resposta de criação:

- `publicUrl`: página pública do orçamento;
- `publicPdfUrl`: PDF público acessível no navegador enquanto o link público estiver válido;
- `authenticatedPdfUrl`: endpoint técnico que exige Bearer token;
- `pdfUrl`: alias de compatibilidade, usando `publicPdfUrl` quando existir.

### Link Público

```txt
POST /quotes/:quoteId/public-link
```

Payload:

```json
{
  "validDays": 15
}
```

Use para gerar link de visualização/aceite do orçamento.

## Tools/Funções a Criar no Lia Flow

Crie um módulo, por exemplo:

```txt
src/integrations/pricing-pro/
```

Com as seguintes funções:

- `pricingProHealth()`
- `searchPricingProducts({ query, limit })`
- `listPricingProducts({ limit })`
- `calculatePricing({ platformSlug, pricingRule, items })`
- `quotePricingShipping({ customerPostalCode, insuranceValue, items })`
- `createCompositePricingQuote({ externalConversationId, customer, platformSlug, pricingRule, items, shipping, output, idempotencyKey })`
- `getPricingQuote({ quoteId })`
- `getPricingQuoteWhatsappText({ quoteId })`
- `createPricingQuotePublicLink({ quoteId, validDays, idempotencyKey })`
- `downloadPricingQuotePdf({ quoteId })`

Crie também uma camada de tools para o agente conversacional com nomes claros:

- `buscar_produtos_precificador`
- `calcular_preco_precificador`
- `calcular_frete_precificador`
- `criar_orcamento_precificador`
- `consultar_orcamento_precificador`
- `gerar_texto_whatsapp_orcamento`
- `gerar_link_publico_orcamento`
- `baixar_pdf_orcamento`

## Cliente HTTP

Implemente um cliente HTTP dedicado com:

- timeout configurável;
- retry apenas para falhas transitórias `429`, `500`, `502`, `503`, `504`;
- sem retry automático para `400`, `401`, `403`, `404`, `422`;
- parse de JSON quando houver JSON;
- suporte a resposta binária para PDF;
- logs sem expor `PRICING_PRO_API_KEY`;
- erro tipado `PricingProApiError`.

Formato sugerido do erro interno:

```ts
type PricingProApiError = {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
  retryable: boolean;
};
```

## Tratamento Humanizado de Erros

Mapeie erros para respostas úteis ao agente:

- `401`: "A chave de integração do Pricing Pro está inválida ou ausente."
- `403`: "A chave não tem permissão para esta ação."
- `404`: "Não encontrei esse recurso no Pricing Pro."
- `409`: "Esta operação parece já ter sido processada. Vou consultar o orçamento existente."
- `422`: "Faltam dados ou algum campo está inválido para montar o orçamento."
- `429`: "O Pricing Pro está limitando chamadas no momento. Aguarde alguns segundos."
- `5xx`: "O Pricing Pro ficou indisponível temporariamente. Tente novamente."

Nunca mostre stack trace, token, custos internos, margem ou dados técnicos sensíveis ao cliente final.

## Fluxo Conversacional Recomendado

1. Identifique intenção: cotar, criar orçamento, calcular frete, consultar orçamento.
2. Busque o produto no Pricing Pro se o usuário não informou SKU exato.
3. Se houver ambiguidade, peça escolha entre os produtos encontrados.
4. Colete quantidade e, em orçamento composto, o nome de cada arte/lote.
5. Chame `calcular_preco_precificador` para estimativa.
6. Se o cliente quiser frete, peça CEP e chame `calcular_frete_precificador`.
7. Mostre resumo curto e peça confirmação antes de criar orçamento.
8. Chame `criar_orcamento_precificador` com `Idempotency-Key`.
9. Retorne:
   - resumo do orçamento;
   - valor total;
   - frete escolhido, quando houver;
   - link público, quando solicitado;
   - texto formatado para WhatsApp, quando útil.

Exemplo de resposta final do agente:

```txt
Pronto, gerei seu orçamento.

Botton 3,5 cm
- 100 unidades
- Arte: Logo principal
- Valor unitário: R$ 2,50
- Subtotal: R$ 250,00

Frete: PAC, R$ 24,90, prazo estimado de 5 dias úteis.
Total: R$ 274,90

Link do orçamento: https://...
```

## Regras de Negócio para o Agente

- Não invente produtos, SKUs ou preços.
- Sempre use os valores retornados pelo Pricing Pro.
- Não exponha custo, margem líquida, comissão ou dados internos.
- Não crie orçamento sem confirmação do usuário quando houver custo total.
- Para orçamento composto, preserve cada item e cada arte como linhas separadas.
- Para produtos personalizados, use `artworkName` para identificar cada arte.
- Se o cliente pedir "10 com uma arte e 20 com outra", crie dois itens separados.
- Se o CEP não estiver disponível, calcule preço sem frete e informe que o frete depende do CEP.
- Se o produto não for encontrado, explique e ofereça listar produtos disponíveis.

## O Que Não Fazer

- Não chamar rotas internas como `/api/quotes/.../olist`, `/api/shipments/...` ou `/api/products` da interface web do Pricing Pro.
- Não conectar diretamente no banco Supabase/Postgres do Pricing Pro.
- Não salvar a API key em logs.
- Não expor endpoint de PDF autenticado ao cliente final.
- Não criar múltiplos orçamentos para a mesma confirmação de conversa.

## Testes Obrigatórios

Crie testes unitários para:

- envio do header `Authorization`;
- envio de `Idempotency-Key` em operações de escrita;
- parse de erro `401`, `403`, `422` e `5xx`;
- busca de produtos com múltiplos resultados;
- criação de payload de orçamento composto;
- download binário de PDF.

Crie testes de integração com mocks para o fluxo:

1. buscar produto;
2. calcular preço;
3. calcular frete;
4. criar orçamento composto;
5. gerar link público;
6. buscar texto para WhatsApp.

Teste de idempotência:

- simule duas chamadas iguais de criação de orçamento com a mesma `Idempotency-Key`;
- garanta que o agente não apresente dois orçamentos diferentes ao usuário.

## Critérios de Aceite

A implementação estará pronta quando:

- as variáveis de ambiente estiverem documentadas;
- existir cliente HTTP dedicado para Pricing Pro;
- existirem tools conversacionais para produtos, preço, frete e orçamento;
- o agente conseguir montar orçamento simples;
- o agente conseguir montar orçamento composto com vários produtos/artes;
- o agente conseguir calcular frete quando houver CEP;
- o agente conseguir gerar link público;
- o agente conseguir obter texto formatado para WhatsApp;
- o agente conseguir baixar PDF autenticado, quando necessário;
- erros forem retornados de forma humanizada;
- testes locais passarem;
- nenhum dado sensível for exposto em logs ou resposta ao cliente.

## Exemplo de Fluxo Completo

Usuário:

```txt
Quero 10 bottons 2,5 com uma arte, 20 bottons 2,5 com outra arte e 15 bottons 3,5 com uma terceira arte. Meu CEP é 04026090.
```

Agente:

1. Busca `bottons 2,5` e `bottons 3,5`.
2. Resolve os SKUs.
3. Calcula preço.
4. Calcula frete para `04026090`.
5. Mostra resumo e pergunta:

```txt
Encontrei os produtos e calculei o orçamento com frete. Posso gerar o orçamento formal com link de aceite?
```

Usuário:

```txt
Pode.
```

Agente chama `POST /quotes/composite` com:

```json
{
  "externalConversationId": "conversation-123",
  "platformSlug": "direct",
  "pricingRule": "per_item",
  "items": [
    {
      "productSku": "BOTTON-25",
      "quantity": 10,
      "artworkName": "Arte 1"
    },
    {
      "productSku": "BOTTON-25",
      "quantity": 20,
      "artworkName": "Arte 2"
    },
    {
      "productSku": "BOTTON-35",
      "quantity": 15,
      "artworkName": "Arte 3"
    }
  ],
  "customer": {
    "postalCode": "04026090"
  },
  "shipping": {
    "calculate": true,
    "strategy": "cheapest"
  },
  "output": {
    "publicLink": true,
    "pdf": true,
    "whatsappText": true
  }
}
```

Agente responde com o resumo, total e link público retornados pelo Pricing Pro.
