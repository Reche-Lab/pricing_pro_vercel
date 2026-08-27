# Planejamento futuro: e-commerce multi-tenant

## Objetivo

Evoluir o Pricing Pro para uma plataforma de comércio eletrônico multi-tenant especializada em produtos personalizados.

A aplicação atual continuará sendo o backoffice administrativo. Cada tenant poderá publicar uma loja responsiva, configurar sua identidade visual, conectar meios de pagamento e, futuramente, utilizar domínio próprio.

O cliente final poderá selecionar produtos, quantidades e variações, enviar ou criar artes, ajustar enquadramento, validar corte e sangria, pagar e acompanhar o pedido. O pedido aprovado seguirá para os fluxos existentes de produção, Olist e Melhor Envio.

Este documento registra uma evolução futura. Sua presença não altera o escopo das implementações em andamento.

## Princípios arquiteturais

- Não transformar o backoffice atual em um monólito ainda maior.
- Separar loja pública, administração, comércio e produção de artes em domínios funcionais.
- Reutilizar os motores existentes de preço, embalagem, frete, arte e produção por meio de serviços bem definidos.
- Nunca confiar em preço, desconto, frete ou total calculado pelo navegador.
- Manter snapshots imutáveis das condições comerciais e produtivas de cada pedido.
- Preservar o isolamento por tenant em banco, storage, domínio, integrações e observabilidade.
- Começar com layouts configuráveis e seguros antes de oferecer edição visual totalmente livre.

## Domínios funcionais

### Backoffice

Área administrativa já existente e expandida com:

- configuração e publicação da loja;
- catálogo, categorias e coleções;
- pedidos de e-commerce;
- pagamentos e estornos;
- estoque ou produção sob demanda;
- cupons e campanhas;
- integração com produção, Olist e Melhor Envio;
- configuração de domínios e identidade visual.

### Storefront público

Aplicação pública voltada ao comprador:

- página inicial da loja;
- catálogo e busca;
- categorias e coleções;
- página de produto;
- carrinho;
- estúdio de personalização;
- checkout;
- pagamento;
- confirmação e acompanhamento do pedido.

### Commerce Core

Camada de regras comerciais independente da interface:

- carrinhos e itens;
- cálculo autoritativo de preços;
- descontos e cupons;
- checkout;
- pedidos e seus estados;
- pagamentos, estornos e webhooks;
- endereços;
- embalagem, frete e rastreamento;
- estoque e reservas quando aplicável;
- idempotência e histórico de eventos.

### Artwork Studio

Evolução dos recursos de arte existentes:

- upload de arte pronta;
- importação de PDF com várias artes;
- assistente criativo com IA;
- geração de sugestões;
- retoque e versões;
- zoom, deslocamento e reenquadramento;
- corte, sangria e margem de segurança;
- aprovação pelo cliente;
- geração de PDF de produção em A4.

## Catálogo e produtos

Os produtos e variantes atuais continuam sendo a fonte técnica de preço, medidas e produção. Uma camada comercial de publicação deverá acrescentar:

- nome público;
- slug;
- descrição curta e completa;
- imagem principal, galeria e vídeo opcional;
- categorias e coleções;
- informações de SEO;
- estado de rascunho ou publicação;
- ordem e destaques na loja;
- variações disponíveis publicamente;
- estoque ou produção sob demanda;
- prazo de produção;
- campos de personalização;
- quantidade máxima de artes;
- regras de preço e publicação por canal.

Alterações administrativas devem poder permanecer em rascunho. A loja consumirá uma versão publicada para evitar mudanças acidentais no conteúdo visível.

## Jornada de produto personalizado

1. O cliente escolhe o produto, sua variação e quantidade.
2. Informa quantas artes ou lotes deseja.
3. Envia uma arte pronta ou descreve o que deseja criar.
4. Opcionalmente utiliza o assistente criativo.
5. Seleciona ou retoca uma versão.
6. Ajusta zoom, posição e enquadramento.
7. Confere corte, sangria e margem de segurança com medidas reais.
8. Aprova a arte de cada grupo.
9. Adiciona os grupos ao carrinho.
10. O servidor recalcula preço, desconto, embalagem e frete.
11. O cliente finaliza o pagamento.
12. O pedido entra no fluxo administrativo e de produção.

Cada item do pedido deverá guardar snapshots de produto, variante, curva de preço, preço aplicado, desconto, medidas, arte aprovada, enquadramento e configurações de produção.

## Editor da loja

A primeira versão não terá posicionamento visual totalmente livre. Utilizará seções responsivas, configuráveis e reordenáveis:

- cabeçalho;
- banner principal;
- produtos em destaque;
- categorias e coleções;
- benefícios;
- instruções para personalizados;
- depoimentos;
- marcas e parceiros;
- perguntas frequentes;
- rodapé.

O administrador poderá:

- arrastar e reordenar seções;
- mostrar ou ocultar seções;
- escolher variações predefinidas de layout;
- configurar cores, fontes, espaçamentos e estilos de botão;
- visualizar desktop, tablet e celular;
- salvar rascunho e publicar;
- restaurar versões anteriores.

A configuração deverá utilizar JSON versionado e validado por schema. Não será permitido inserir JavaScript ou CSS arbitrário.

## Domínios e resolução de tenant

Primeira etapa:

```text
tenant.plataforma.com.br
```

Etapa posterior:

```text
loja.tenant.com.br
www.tenant.com.br
```

Fluxo planejado:

1. O tenant informa o domínio.
2. O sistema apresenta os registros DNS necessários.
3. O domínio é verificado por CNAME ou TXT.
4. O domínio é registrado na infraestrutura de hospedagem.
5. O certificado TLS é emitido.
6. O domínio passa a resolver para a loja publicada.
7. O middleware identifica o tenant pelo header `Host` validado.

Os domínios deverão ter unicidade global, estados de verificação, histórico, domínio principal e proteção contra host spoofing.

Referência inicial: [Vercel Multi-tenant Platforms](https://vercel.com/docs/multi-tenant-platforms).

## Pagamentos

Estratégia inicial recomendada: cada tenant conecta sua própria conta do provedor por OAuth e recebe os pagamentos diretamente.

O Commerce Core deverá expor uma interface de providers para permitir:

- Mercado Pago;
- PagSeguro;
- Stripe;
- Pix bancário;
- pagamento manual;
- outros provedores futuros.

Uma operação de marketplace com split poderá ser avaliada depois. Ela aumenta a complexidade contratual, contábil, regulatória e operacional da plataforma.

Requisitos obrigatórios:

- nunca armazenar dados de cartão;
- verificar assinatura e origem de webhooks;
- processar eventos com idempotência;
- manter histórico de tentativas e transições;
- não confiar no redirecionamento do navegador como confirmação de pagamento;
- conciliar valor esperado, valor pago, taxas e estornos;
- isolar credenciais por tenant.

Referência inicial: [Mercado Pago Split Payments](https://www.mercadopago.com.br/developers/pt/docs/split-payments/landing).

## Modelo de dados preliminar

Entidades candidatas:

- `storefronts`;
- `storefront_domains`;
- `storefront_theme_versions`;
- `storefront_sections`;
- `product_media`;
- `product_publications`;
- `collections`;
- `collection_products`;
- `carts`;
- `cart_items`;
- `checkout_sessions`;
- `commerce_orders`;
- `commerce_order_items`;
- `commerce_order_status_history`;
- `payment_connections`;
- `payments`;
- `payment_events`;
- `discount_coupons`;
- `inventory_reservations`.

O modelo final deverá ser definido em ADR antes das migrations. Orçamento e pedido permanecerão conceitos distintos. Um orçamento poderá originar um pedido, mas não será tratado implicitamente como pedido pago.

## Mídias e storage

- Imagens comerciais publicadas poderão utilizar URLs públicas ou CDN.
- Artes de clientes continuarão privadas e acessíveis por autorização ou URL assinada.
- Arquivos deverão ser organizados por tenant e finalidade.
- Uploads deverão validar assinatura real, MIME, extensão, tamanho e dimensões.
- Deverão existir cotas de armazenamento e retenção.
- Transformações derivadas nunca substituirão silenciosamente o original.

Referência inicial: [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control).

## Segurança pública

- Rate limiting por IP, tenant, conta e operação.
- CAPTCHA ou desafio equivalente em fluxos sujeitos a abuso.
- URLs assinadas para arquivos privados.
- Verificação de conteúdo, MIME e dimensões de uploads.
- Limites de uso de IA por tenant, cliente e produto.
- Cálculo de preço exclusivamente no servidor.
- Idempotência no carrinho, checkout, pagamento e criação de pedido.
- Webhooks assinados e auditados.
- RLS e filtros explícitos por tenant.
- Proteção contra enumeração de pedidos e clientes.
- Consentimento, privacidade, cookies e requisitos da LGPD.
- Observabilidade com correlação entre checkout, pagamento, pedido e produção.

## Fases sugeridas

### Fase 0 - Arquitetura

- Criar ADRs dos limites entre catálogo, orçamento, pedido e produção.
- Definir contratos internos dos motores de preço, frete e arte.
- Definir estratégia de publicação e snapshots.
- Definir modelo de cobrança da plataforma e recebimento do tenant.

### Fase 1 - Commerce Core

- Criar carrinho, checkout e pedido.
- Implementar snapshots comerciais.
- Reutilizar cálculo de preço, embalagem e frete.
- Criar estados e histórico de pedido.

### Fase 2 - Catálogo e storefront MVP

- Adicionar mídias e publicação de produtos.
- Publicar loja por subdomínio.
- Criar catálogo, produto, carrinho e checkout responsivos.
- Integrar a identidade visual básica do tenant.

### Fase 3 - Pagamentos

- Conectar Mercado Pago por tenant.
- Implementar checkout, webhooks, idempotência e estornos.
- Exibir estados de pagamento no backoffice e na loja.

### Fase 4 - Personalização

- Incorporar o Artwork Studio na página pública do produto.
- Vincular grupos de arte aos itens do carrinho.
- Exigir aprovação antes do pagamento ou produção, conforme regra do tenant.

### Fase 5 - Editor de loja

- Criar seções configuráveis e reordenáveis.
- Implementar rascunho, preview responsivo, publicação e histórico.

### Fase 6 - Domínio próprio

- Implementar cadastro, verificação DNS e ativação de domínio.
- Integrar provisionamento de domínio e certificado.
- Garantir resolução segura do tenant por host.

### Fase 7 - Operação integrada

- Enviar pedido para Olist.
- Emitir nota conforme fluxo autorizado.
- Comprar e gerar etiqueta no Melhor Envio.
- Atualizar expedição, rastreamento e produção.

### Fase 8 - Evoluções comerciais

- cupons e campanhas;
- avaliações;
- recuperação de carrinho;
- analytics e funil;
- estoque e reservas avançadas;
- marketplace e split, se aprovado.

## Decisões pendentes

Antes da implementação, decidir:

- se o pagamento será sempre recebido diretamente pelo tenant;
- quais planos terão loja, domínio próprio e IA;
- se haverá controle de estoque ou somente produção sob demanda;
- quando a aprovação da arte será obrigatória;
- se o pagamento ocorrerá antes ou depois da aprovação da arte;
- quais produtos administrativos poderão ser publicados;
- quais provedores de pagamento entrarão no MVP;
- política de taxas, cancelamento e estorno;
- política de armazenamento e retenção de artes;
- domínio principal e estratégia de subdomínios da plataforma.

## Direção recomendada

Iniciar com um storefront estruturado, configurável e especializado em personalizados. Não começar por um construtor visual totalmente livre.

Essa abordagem permite entregar uma loja funcional mais cedo, reaproveitar os recursos existentes com menor risco e manter um caminho de evolução para uma plataforma comparável a soluções generalistas, porém diferenciada pelo fluxo completo de criação, aprovação e produção de artes personalizadas.
