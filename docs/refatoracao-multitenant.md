# Plano de Refatoracao: Plataforma Multi-Tenant de Precificacao e Orcamentos

## 1. Objetivo

Transformar o projeto atual, que nasceu como um HTML monolitico com funcoes serverless, em uma aplicacao moderna, segura, multi-tenant e multiusuarios por tenant.

O sistema devera permitir que diferentes empresas, marcas ou operacoes usem a mesma plataforma com dados isolados, usuarios proprios, produtos proprios, regras de precificacao proprias, integracoes proprias e historico proprio.

O objetivo tecnico e criar uma base sustentavel para:

- manter e evoluir regras de negocio sem alterar um HTML gigante;
- incluir novos produtos alem de bottons;
- proteger dados reais de custo, preco, margem e cliente;
- suportar multiplos tenants;
- suportar multiplos usuarios por tenant;
- criar e historizar orcamentos;
- integrar com Correios, Olist e CRM;
- permitir manutencao segura por testes, tipos, validacoes e arquitetura clara.

## 2. Diagnostico do Estado Atual

O projeto atual possui:

- `index.html` com UI, estado, calculos, PDF, CSV, frete e login acoplados;
- pasta `api/` com endpoints serverless para login, logout, configuracao e Correios;
- dados reais de precificacao no frontend;
- autenticacao simples com usuario e senha via variaveis de ambiente;
- JWT implementado manualmente;
- ausencia de banco de dados;
- ausencia de modelo de usuarios;
- ausencia de tenants;
- ausencia de testes automatizados;
- regras de negocio misturadas com manipulacao de DOM;
- demo baseada no mesmo bundle que contem dados reais.

Esse desenho funcionou para validar a ideia, mas nao e adequado para o proximo nivel do produto.

## 3. Principios da Nova Arquitetura

As decisoes da refatoracao devem seguir estes principios:

- O frontend nunca deve conter dados reais sensiveis de custo, margem, curva ou integracao.
- O backend deve recalcular precos, margens, fretes e totais antes de salvar ou enviar um orcamento.
- Cada tenant deve acessar apenas seus proprios dados.
- Cada usuario deve ter permissoes claras dentro do tenant.
- Regras de negocio devem ser codificadas em modulos puros, testaveis e independentes da interface.
- Integracoes externas devem ficar atras de services/adapters, nunca espalhadas pela UI.
- A migracao deve ser incremental, preservando o comportamento atual enquanto troca a fundacao.

## 4. Arquitetura Alvo

Migrar para uma aplicacao NextJS real com TypeScript.

Estrutura proposta:

```txt
src/
  app/
    (public)/
      demo/
    (auth)/
      login/
      forgot-password/
    (app)/
      dashboard/
      pricing/
      quotes/
      products/
      customers/
      settings/
      users/
    api/
      auth/
      products/
      pricing/
      shipping/
      quotes/
      customers/
      integrations/

  components/
    ui/
    layout/
    forms/
    pricing/
    products/
    quotes/

  domain/
    pricing/
    shipping/
    products/
    quotes/
    customers/
    tenants/

  services/
    correios/
    olist/
    crm/
    pdf/
    csv/

  repositories/
    tenants/
    users/
    products/
    pricing/
    quotes/
    customers/

  lib/
    auth/
    db/
    validation/
    errors/
    logger/
    rate-limit/

  tests/
    unit/
    integration/
    e2e/
```

## 5. Multi-Tenant

### 5.1 Definicao de Tenant

Um tenant representa uma empresa, loja, marca, unidade de negocio ou cliente da plataforma.

Cada tenant podera ter:

- usuarios proprios;
- produtos proprios;
- curvas de preco proprias;
- custos proprios;
- regras de margem proprias;
- regras de plataforma proprias;
- embalagens proprias;
- credenciais de integracao proprias;
- clientes proprios;
- orcamentos proprios;
- identidade visual propria.

### 5.2 Estrategia de Isolamento

No primeiro momento, recomenda-se usar banco compartilhado com coluna `tenant_id` em todas as tabelas de negocio.

Todas as consultas devem sempre filtrar por `tenant_id`.

Tabelas sensiveis tambem devem ser protegidas por:

- validacao no backend;
- testes de isolamento;
- middleware de tenant;
- policies se o banco escolhido suportar Row Level Security.

Opcao recomendada:

- Postgres;
- Prisma ou Drizzle;
- RLS se usar Supabase/Postgres com policies;
- `tenant_id` obrigatorio em todas as entidades de negocio.

### 5.3 Resolucao do Tenant

Possiveis estrategias:

- subdominio: `tenant.groundpricing.com`;
- dominio customizado por tenant;
- slug na URL: `/t/{tenantSlug}`;
- tenant selecionado apos login, caso o usuario participe de mais de um tenant.

Recomendacao inicial:

- usar `tenantSlug` ou tenant selecionado apos login;
- preparar o modelo para suportar subdominio futuramente.

### 5.4 Dados Globais vs Dados do Tenant

Alguns dados podem ser globais, mas customizaveis por tenant.

Globais:

- categorias base de produto;
- templates de unidade de medida;
- tipos de integracao suportados;
- permissoes do sistema.

Por tenant:

- produtos ativos;
- nomes comerciais;
- custos;
- curvas;
- embalagens;
- plataformas de venda;
- clientes;
- orcamentos;
- credenciais;
- usuarios;
- identidade visual.

## 6. Multiusuarios por Tenant

### 6.1 Usuarios

Um usuario deve poder pertencer a um ou mais tenants.

Exemplo:

- Bruno pode ser admin do tenant `Ground Shop`;
- um vendedor pode acessar apenas orcamentos;
- um consultor externo pode ter acesso somente leitura;
- um usuario interno da plataforma pode ter papel de suporte.

### 6.2 Papeis

Papeis iniciais:

- `owner`: dono do tenant, gerencia tudo;
- `admin`: gerencia usuarios, produtos, curvas, integracoes e orcamentos;
- `manager`: gerencia produtos, curvas e orcamentos;
- `sales`: cria clientes e orcamentos;
- `viewer`: apenas leitura;
- `support`: usuario interno da plataforma, com acesso controlado e auditado.

### 6.3 Permissoes

Permissoes devem ser granulares e nao depender apenas do nome do papel.

Exemplos:

- `products:read`;
- `products:write`;
- `pricing:read`;
- `pricing:write`;
- `quotes:read`;
- `quotes:write`;
- `quotes:approve`;
- `customers:read`;
- `customers:write`;
- `users:manage`;
- `integrations:manage`;
- `settings:manage`.

## 7. Autenticacao e Seguranca

Substituir o login atual por uma solucao robusta.

Opcoes:

- Auth.js/NextAuth com credentials e magic link;
- Supabase Auth;
- Clerk;
- Auth0.

Recomendacao pragmatica:

- se quiser velocidade e painel pronto: Supabase Auth ou Clerk;
- se quiser controle total: Auth.js com Postgres.

Requisitos:

- senhas com hash seguro;
- sessao via cookie `HttpOnly`, `Secure` e `SameSite`;
- sem fallback de senha em producao;
- reset de senha;
- convite de usuarios por email;
- bloqueio de usuario;
- rate limit no login;
- auditoria de login;
- protecao CSRF onde aplicavel;
- validacao de entrada com `zod`;
- logs sem documentos, tokens ou payloads sensiveis.

## 8. Modo Demo

O modo demo deve ser separado dos dados reais.

Regras:

- demo nao pode carregar curvas reais;
- demo nao pode carregar custos reais;
- demo nao pode exibir telefone, site ou identidade real se isso for sensivel;
- demo deve usar produtos ficticios;
- demo deve usar curvas ficticias;
- demo pode permitir simulacao, mas nao pode chamar integracoes reais;
- PDFs de demo devem ter marca d'agua;
- orcamentos demo nao devem ser enviados para Olist ou CRM.

Implementacao:

- rota publica `/demo`;
- fixture propria para produtos ficticios;
- backend opcional para calcular demo com dados falsos;
- nenhuma dependencia de tenant real.

## 9. Dominios de Negocio

### 9.1 Produtos

O sistema deve deixar de ser centrado em bottons e passar a trabalhar com produtos genericos.

Produtos previstos:

- bottons;
- chaveiros;
- espelhos;
- abridores de garrafa;
- ima de geladeira;
- futuros produtos personalizados.

Cada produto pode ter:

- nome;
- categoria;
- variantes;
- dimensoes;
- peso;
- custo unitario;
- insumos;
- curva de preco;
- regra de embalagem;
- prazo de producao;
- status ativo/inativo.

### 9.2 Variantes

Exemplos:

- botton 2,5 cm;
- botton 3,5 cm;
- chaveiro redondo;
- espelho 5,5 cm;
- abridor premium;
- ima retangular.

Cada variante pode ter curva, custo, peso e embalagem proprios.

### 9.3 Precificacao

O dominio de precificacao deve conter:

- curva por ancoragem;
- curva logistica;
- preco minimo;
- preco base;
- quantidade;
- desconto progressivo;
- custo unitario;
- custo total;
- comissao;
- taxa fixa;
- frete vendedor;
- margem liquida;
- margem percentual;
- arredondamento;
- regras por canal.

O backend deve ter uma funcao principal semelhante a:

```ts
calculateQuote(input): QuoteCalculationResult
```

Essa funcao deve ser pura, testavel e independente de React.

### 9.4 Plataformas e Canais

Os canais atuais devem virar configuracao por tenant:

- Nuvem Shop;
- Mercado Livre Classico;
- Mercado Livre Premium;
- Shopee Padrao;
- Shopee Frete Gratis;
- outros canais futuros.

Cada canal pode ter:

- percentual de comissao;
- taxa fixa;
- regra de frete;
- limite de frete gratis;
- regra de arredondamento;
- margem minima desejada.

### 9.5 Embalagens e Frete

O CSV atual de caixas deve virar uma estrutura persistida no banco.

Entidades:

- caixas;
- capacidades por produto/variante;
- peso da embalagem;
- dimensoes;
- regras de divisao em multiplas caixas.

O dominio de frete deve:

- escolher embalagem;
- distribuir itens por caixas;
- calcular peso bruto;
- aplicar dimensoes minimas;
- chamar Correios ou outra transportadora;
- adicionar seguro quando configurado;
- permitir frete manual;
- retornar cotacao normalizada.

### 9.6 Orcamentos

O orcamento deve ser uma entidade persistida, nao apenas um PDF gerado no browser.

Campos:

- tenant;
- usuario criador;
- cliente;
- itens;
- produto/variante;
- quantidade;
- canal;
- preco unitario;
- preco total;
- frete;
- desconto;
- margem;
- validade;
- status;
- observacoes;
- snapshot das regras usadas.

Status sugeridos:

- `draft`;
- `sent`;
- `accepted`;
- `rejected`;
- `expired`;
- `cancelled`.

Importante: cada orcamento deve salvar um snapshot da curva e dos custos usados. Assim, se a curva mudar no futuro, o orcamento antigo continua explicavel.

### 9.7 Clientes

Clientes devem pertencer ao tenant.

Dados:

- nome;
- CPF/CNPJ;
- email;
- telefone;
- endereco;
- observacoes;
- identificador externo no Olist;
- historico de orcamentos.

CPF/CNPJ deve ser validado, mas armazenado com cuidado.

## 10. Integracoes

### 10.1 Correios

Correios deve ser um adapter dentro de `services/correios`.

Responsabilidades:

- montar payload oficial;
- chamar API;
- normalizar resposta;
- tratar erro;
- registrar log;
- nunca expor token ao frontend.

### 10.2 Olist

Criar camada `services/olist`.

Funcionalidades futuras:

- criar cliente no Olist;
- atualizar cliente existente;
- enviar cotacao;
- criar orcamento no CRM do Olist;
- sincronizar status;
- registrar identificadores externos.

Cada tenant deve ter suas credenciais proprias, armazenadas de forma segura.

### 10.3 CRM

O CRM deve ser tratado como integracao independente, mesmo que inicialmente seja o CRM do Olist.

Isso evita acoplamento caso outro tenant use outro CRM no futuro.

## 11. Modelo de Dados Inicial

Tabelas sugeridas:

```txt
tenants
tenant_members
users
roles
permissions
role_permissions

products
product_variants
pricing_curves
pricing_anchors
platform_rules
packaging_boxes
packaging_capacities

customers
quotes
quote_items
quote_calculation_snapshots

integration_connections
integration_logs
audit_logs
```

### 11.1 Tenants

```txt
id
name
slug
status
logo_url
default_currency
created_at
updated_at
```

### 11.2 Tenant Members

```txt
id
tenant_id
user_id
role_id
status
invited_by
joined_at
created_at
updated_at
```

### 11.3 Products

```txt
id
tenant_id
name
slug
category
description
active
created_at
updated_at
```

### 11.4 Product Variants

```txt
id
tenant_id
product_id
name
sku
unit_cost
unit_weight_kg
height_cm
width_cm
length_cm
active
created_at
updated_at
```

### 11.5 Pricing Curves

```txt
id
tenant_id
product_variant_id
name
method
version
active
created_by
created_at
updated_at
```

### 11.6 Pricing Anchors

```txt
id
tenant_id
pricing_curve_id
quantity
unit_price
created_at
updated_at
```

### 11.7 Quotes

```txt
id
tenant_id
customer_id
created_by
status
valid_until
subtotal
shipping_total
discount_total
grand_total
margin_amount
margin_percent
external_crm_id
created_at
updated_at
```

## 12. API Interna

Endpoints iniciais:

```txt
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/tenants
POST   /api/tenants
GET    /api/tenants/:tenantId

GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id

GET    /api/pricing/curves
POST   /api/pricing/curves
POST   /api/pricing/calculate

POST   /api/shipping/quote

GET    /api/customers
POST   /api/customers
PATCH  /api/customers/:id

GET    /api/quotes
POST   /api/quotes
GET    /api/quotes/:id
POST   /api/quotes/:id/pdf
POST   /api/quotes/:id/send-to-crm

GET    /api/users
POST   /api/users/invite
PATCH  /api/users/:id
```

Todos os endpoints privados devem:

- exigir sessao;
- resolver tenant;
- validar permissao;
- validar input;
- filtrar por `tenant_id`;
- registrar auditoria quando alterar dado critico.

## 13. UI Alvo

Telas principais:

- Login;
- Selecao de tenant, quando aplicavel;
- Dashboard;
- Precificador;
- Produtos;
- Curvas de preco;
- Embalagens;
- Clientes;
- Orcamentos;
- Usuarios;
- Configuracoes;
- Integracoes;
- Demo publica.

O precificador deve ser a primeira experiencia util, sem virar uma landing page.

O fluxo ideal:

1. usuario escolhe produto;
2. escolhe variante;
3. informa quantidade;
4. escolhe canal;
5. informa cliente;
6. calcula preco;
7. calcula frete;
8. salva orcamento;
9. gera PDF;
10. envia para WhatsApp, Olist ou CRM.

## 14. Testes

Testes obrigatorios para a nova base:

- calculo de curva por ancoragem;
- calculo logistico;
- comissao e taxa fixa;
- regra de frete gratis;
- margem liquida;
- selecao de embalagem;
- divisao em multiplas caixas;
- validacao de CPF/CNPJ;
- isolamento por tenant;
- permissao por papel;
- criacao de orcamento;
- snapshot de calculo;
- adapter dos Correios com mock;
- adapter do Olist com mock.

Ferramentas sugeridas:

- Vitest para testes unitarios;
- Testing Library para componentes;
- Playwright para fluxos principais;
- MSW ou mocks proprios para APIs externas.

## 15. Observabilidade e Auditoria

Adicionar:

- logs estruturados;
- identificador de request;
- logs de integracao;
- auditoria de alteracoes criticas;
- monitoramento de erros;
- metricas de tempo de resposta;
- alertas para falhas de integracao.

Eventos auditaveis:

- login;
- convite de usuario;
- alteracao de papel;
- criacao/edicao de produto;
- alteracao de curva;
- alteracao de custo;
- criacao de orcamento;
- envio para CRM;
- alteracao de credenciais de integracao.

## 16. Plano Incremental de Migracao

### Fase 0: Congelamento e inventario

- Documentar regras atuais.
- Identificar dados reais que nao podem ficar no frontend.
- Criar backlog tecnico.
- Definir banco, auth e hospedagem.

### Fase 1: Fundacao NextJS

- Criar estrutura NextJS com TypeScript.
- Configurar lint, formatacao e testes.
- Migrar UI atual para componentes mantendo comportamento.
- Manter deploy funcionando.

### Fase 2: Extracao das regras de negocio

- Extrair calculos de preco para `domain/pricing`.
- Extrair embalagem para `domain/shipping`.
- Extrair validacoes para `lib/validation`.
- Criar testes cobrindo comportamento atual.

### Fase 3: Autenticacao, usuarios e tenants

- Implementar auth real.
- Criar tabelas `tenants`, `users` e `tenant_members`.
- Criar papeis e permissoes.
- Proteger rotas e APIs.
- Remover login antigo.

### Fase 4: Demo isolada

- Criar `/demo` com produtos ficticios.
- Remover dados reais do bundle publico.
- Bloquear integracoes reais no demo.

### Fase 5: Produtos e curvas no banco

- Criar CRUD de produtos.
- Criar CRUD de variantes.
- Criar CRUD de curvas e ancoragens.
- Migrar bottons atuais para dados do tenant.
- Adicionar suporte a chaveiros, espelhos, abridores e imas.

### Fase 6: Orcamentos persistidos

- Criar clientes.
- Criar orcamentos.
- Salvar snapshot de calculo.
- Gerar PDF a partir do orcamento salvo.
- Criar historico e status.

### Fase 7: Frete profissional

- Migrar caixas CSV para banco.
- Criar regras por produto/variante.
- Criar endpoint de cotacao de frete.
- Melhorar adapter dos Correios.
- Preparar multiplas transportadoras.

### Fase 8: Integracoes Olist e CRM

- Criar conexao por tenant.
- Criar cliente no Olist.
- Enviar orcamento/cotacao para CRM.
- Registrar logs, retries e falhas.
- Criar tela de status da integracao.

### Fase 9: Administracao e hardening

- Tela de usuarios.
- Tela de permissoes.
- Auditoria.
- Rate limit.
- Monitoramento.
- Backups.
- Testes e2e dos fluxos principais.

## 17. Prioridades Recomendadas

A ordem mais segura e:

1. NextJS real com TypeScript.
2. Extracao e testes dos calculos atuais.
3. Auth real.
4. Multi-tenant e usuarios por tenant.
5. Demo isolada.
6. Produtos e curvas no banco.
7. Orcamentos persistidos.
8. Frete reestruturado.
9. Integracoes Olist/CRM.

Nao e recomendavel iniciar pelas integracoes antes de resolver tenant, usuarios, dados e orcamentos persistidos. Caso contrario, as integracoes vao acoplar ainda mais o sistema ao formato atual.

## 18. Primeiro Marco Entregavel

O primeiro marco deve entregar:

- aplicacao NextJS real;
- TypeScript;
- login seguro;
- tenant unico inicial funcionando;
- usuarios vinculados ao tenant;
- modo demo separado;
- bottons funcionando com os mesmos calculos atuais;
- regras extraidas para modulos testaveis;
- testes unitarios dos calculos;
- dados reais removidos do HTML publico.

Esse marco cria a base para evoluir sem quebrar a operacao atual.

## 19. Decisoes Pendentes

Antes da implementacao completa, precisamos decidir:

- banco: Supabase, Neon, Vercel Postgres ou outro Postgres;
- ORM: Prisma ou Drizzle;
- auth: Supabase Auth, Clerk, Auth.js ou outra solucao;
- estrategia de tenant: slug, subdominio ou selecao apos login;
- necessidade de pagamento/planos por tenant;
- quem sera o usuario `owner` inicial;
- quais dados atuais devem ser migrados como tenant `Ground Shop`;
- quais produtos ficticios vao compor o demo;
- quais APIs exatas do Olist e CRM serao usadas.

## 20. Criterios de Sucesso

A refatoracao sera considerada bem-sucedida quando:

- novos produtos puderem ser cadastrados sem alterar codigo central;
- cada tenant tiver dados isolados;
- usuarios tiverem permissoes por tenant;
- demo nao revelar dados reais;
- orcamentos forem salvos e rastreaveis;
- calculos forem testados;
- integracoes forem auditaveis;
- custos e curvas nao ficarem expostos no frontend publico;
- o sistema puder crescer sem voltar ao modelo de HTML monolitico.

