# Planejamento futuro: e-commerce multi-tenant

## Objetivo

Evoluir o Pricing Pro para uma plataforma de comércio eletrônico multi-tenant especializada em produtos personalizados.

A aplicação atual continuará sendo o backoffice administrativo. Cada tenant poderá publicar uma loja responsiva, configurar sua identidade visual, conectar meios de pagamento e, futuramente, utilizar domínio próprio.

O e-commerce será um módulo opcional, desativado por padrão. Tenants que não precisarem de loja continuarão usando precificador, orçamentos, produção e, opcionalmente, ERP, sem depender de carrinho, conta de comprador ou provedor de pagamento. A Ground Shop será o primeiro tenant-piloto, sem regras ou identificadores fixos no código compartilhado.

O cliente final poderá selecionar produtos, quantidades e variações, enviar ou criar artes, ajustar enquadramento, validar corte e sangria, pagar e acompanhar o pedido. O pedido aprovado seguirá para os fluxos existentes de produção, Olist e Melhor Envio.

Este documento registra uma evolução futura. Sua presença não altera o escopo das implementações em andamento.

Atualização de escopo: 05/09/2026. Os requisitos abaixo estão planejados; não representam funcionalidades de e-commerce já implementadas ou homologadas.

## Princípios arquiteturais

- Não transformar o backoffice atual em um monólito ainda maior.
- Separar loja pública, administração, comércio e produção de artes em domínios funcionais.
- Reutilizar os motores existentes de preço, embalagem, frete, arte e produção por meio de serviços bem definidos.
- Nunca confiar em preço, desconto, frete ou total calculado pelo navegador.
- Manter snapshots imutáveis das condições comerciais e produtivas de cada pedido.
- Preservar o isolamento por tenant em banco, storage, domínio, integrações e observabilidade.
- Começar com layouts configuráveis e seguros antes de oferecer edição visual totalmente livre.
- Separar habilitação do módulo, configuração da loja e publicação: habilitar não publica produtos ou expõe dados administrativos.
- Manter ERP opcional: indisponibilidade ou ausência de Olist não impede receber um pedido na plataforma.
- Não exigir conta administrativa, vínculo em `tenant_members` ou chave de agente para um comprador.

## Referência GroundShop_NuvemShop

Referência local examinada: `../GrounShop/GroundShop_NuvemShop`, relativa à pasta `apps` que contém este projeto. Há também uma cópia em `../GrounShop/Atualizado/GroundShop_NuvemShop`.

O repositório contém um tema exportado, não um backend de comércio. Conforme seu `README.md`, os templates dependem da plataforma Nuvemshop para executar funcionalidades comerciais. Reaproveitar a experiência e os ativos autorizados, reconstruindo os fluxos em componentes e serviços próprios, sem copiar dependências de runtime da Nuvemshop.

Referências funcionais encontradas:

- `templates/home.tpl` e `snipplets/home/`: categorias, destaques, banners, marcas e depoimentos;
- `templates/search.tpl` e `templates/category.tpl`: descoberta e listagem;
- `templates/product.tpl` e `snipplets/product/product-form.tpl`: galeria, variações, quantidade e apresentação de desconto progressivo;
- `templates/cart.tpl` e `snipplets/cart/`: carrinho, resumo e entrega;
- `templates/account/`: cadastro, login, recuperação de senha, endereços e pedidos;
- `static/js/store.js.tpl`: referência de comportamento, não implementação reutilizável do backend.

Antes de publicar a Ground Shop, confirmar quais imagens, textos, identidade visual e conteúdos comerciais devem ser utilizados. O tema exportado não garante conter todos os dados e imagens da loja em produção.

## Módulo opcional e isolamento

- Habilitação por tenant, controlada pelo superadmin ou entitlement do plano; owner/admin configura a loja somente quando habilitado.
- Estados da loja separados: rascunho, publicada e pausada. Pausar impede novas compras, mas não elimina histórico, acesso autorizado a pedidos existentes ou processamento de pagamentos em andamento.
- Menus comerciais aparecem apenas para tenants habilitados e usuários autorizados. A API verifica a mesma condição, independentemente da UI.
- Nenhum produto administrativo é publicado automaticamente. A seleção do catálogo, preços por canal e conteúdo público exige publicação explícita.
- Compradores pertencem ao tenant da loja. Mesmo e-mail em duas lojas não concede acesso cruzado; vinculação ao cadastro comercial/ERP é explícita e auditada.
- Pagamentos das vendas não compartilham credenciais, eventos ou saldos com a cobrança da assinatura do tenant.
- Mudanças de planos, expiração de trial ou suspensão da loja não podem apagar obrigações relativas a pedidos já pagos. Definir permissão de consulta, atendimento e estorno nesses estados.

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

### Quantidade de produtos e de artes

O administrador define por publicação de produto/variante:

- se há personalização, se é opcional ou obrigatória;
- se o comprador pode usar uma ou várias artes;
- quantidades mínima, máxima e múltiplo de venda;
- máximo de artes e mínimo de unidades por arte;
- canal de preços, curva progressiva ou preço por faixa;
- base de cálculo: quantidade total da variante, quantidade por arte ou média das quantidades por arte;
- se o envio e a aprovação das artes são exigidos no checkout ou antes da produção;
- se o assistente criativo é permitido e qual a cota aplicável.

O comprador vê quantidade total, quantidade de artes e distribuição em grupos. O sistema pode propor distribuição equilibrada, mas não descarta nem cria unidades ao arredondar: 100 unidades em 3 artes podem ser distribuídas como 34, 33 e 33. O total dos grupos deve sempre coincidir com a quantidade comprada.

Cada grupo possui identificador estável, nome da arte, quantidade, versão selecionada e aprovação. Nomes iguais não fundem grupos automaticamente. Regras de precificação são escolhidas pelo administrador; o comprador não pode alterar curvas, comissões, descontos administrativos ou o critério para obter um preço menor.

Ao alterar quantidade, grupos, variante ou endereço, recalcular no servidor os valores afetados e invalidar a cotação de frete anterior quando necessário. Mostrar ao comprador o novo total antes de confirmar o checkout. Produtos sem personalização não exibem campos de artes.

### Sessão de personalização

As artes atuais estão vinculadas a itens de orçamento. Criar uma sessão de personalização pertencente ao carrinho/comprador para permitir upload, retoque, reenquadramento e aprovação antes de existir um pedido, sem gerar orçamentos fictícios para visitantes.

- Reutilizar motores de geometria e imagem; adaptar autorização e persistência por contratos próprios.
- Carregar editores somente ao abrir o estúdio, mantendo a página de produto leve.
- Upload pronto deve ser o caminho mais direto. IA e retoque são opções, não etapas obrigatórias.
- Mostrar original, versão editada e versão enquadrada, com proporções, Segurança, Sangria e Corte idênticos aos configurados no produto e no PDF de produção.
- Registrar aprovação com versão e hash do arquivo, geometria, enquadramento, quantidade, data e identidade/autorização do comprador.
- Alterar arquivo, enquadramento ou geometria invalida a aprovação correspondente.
- O pedido preserva a versão aprovada; edição posterior exige revisão explícita, sem sobrescrever silenciosamente a produção autorizada.
- Se permitido pagar antes da aprovação, manter o pedido pago e bloquear produção até a aprovação. Esse fluxo não será confundido com falha no pagamento.
- Carrinhos e arquivos abandonados possuem retenção e limpeza; originais vinculados a pedidos seguem política própria.

## Mapa de páginas

Rotas lógicas da loja; o prefixo público definitivo será resolvido por subdomínio/domínio verificado. Caminhos de desenvolvimento não autorizam aceitar `tenant_id` informado livremente pelo navegador.

| Página | Conteúdo e comportamento |
| --- | --- |
| Início | Marca, produtos reais, categorias, destaques e busca; identidade configurável do tenant |
| Catálogo e categoria | Filtros, ordenação, paginação, estados vazios e somente publicações ativas |
| Busca | Nome, SKU público, aliases e variações de medida, sem expor custos ou produtos privados |
| Produto | Galeria, variantes, prazo, quantidade, grupos de artes, preço unitário/total e faixas |
| Estúdio | Upload, versões, retoque, enquadramento, IA quando habilitada e aprovação por grupo |
| Carrinho | Itens persistentes, quantidades, artes, edição, remoção, estimativa de entrega e resumo |
| Cadastro e verificação | Nome, e-mail e dados mínimos, consentimentos separados e verificação de contato |
| Login e recuperação | Sessão de comprador, redefinição por link temporário e retomada segura do carrinho |
| Minha conta | Dados pessoais, endereços, troca de senha e encerramento de sessão |
| Meus pedidos | Histórico pertencente ao comprador autenticado naquela loja |
| Detalhe do pedido | Pagamento, artes, produção, entrega, rastreamento e atendimento |
| Checkout | Identificação, endereço/CEP, destinatário/aos cuidados, frete, pagamento e revisão final |
| Pagamento e retorno | Redirecionamento seguro ou experiência homologada do provider; pendente, aprovado, recusado e expirado |
| Confirmação | Número do pedido, composição dos valores, próximas etapas e acesso ao acompanhamento |
| Institucionais | Contato, entrega, privacidade e políticas comerciais revisadas antes da publicação |
| Indisponibilidade | Loja pausada, produto indisponível, link expirado e erro recuperável sem perder o carrinho |

O comprador pode navegar e montar o carrinho sem login. Para a primeira versão, propor identificação e acesso verificado antes de concluir a compra; confirmar essa política na homologação. Ao autenticar, reconciliar o carrinho anônimo sem duplicar itens e sem confiar em preços salvos no navegador.

### Administração do módulo

Área própria de Loja, sem concentrar todas as opções na tela Geral:

- Visão geral: configuração pendente, publicação e pedidos que exigem ação.
- Aparência: identidade, imagens, seções, preview, rascunho e publicação.
- Catálogo: publicação, mídia, categorias, regras de quantidade/artes, prazo e canal de preço.
- Pedidos: filtros, detalhe, pagamentos, artes, atendimento, produção e integrações opcionais.
- Clientes da loja: dados autorizados, endereços e histórico, separados dos usuários administrativos.
- Pagamentos: conexões por provider, ambiente de teste/produção, métodos habilitados, estado e reautorização.
- Entrega: origem, embalagem, serviços habilitados, retirada e prazo de produção separado do prazo de transporte.
- Domínios: verificação, ativação, domínio principal e erros de DNS/TLS.
- Uso e limites: IA, armazenamento, volume e consumo do módulo.

### UX e identidade visual

Preservar os padrões reconhecíveis do tema Ground Shop, com tipografia legível, fotografia dos produtos, hierarquia clara e navegação responsiva. A loja terá tema próprio; não herda obrigatoriamente o visual escuro e denso do backoffice.

Divulgar informações progressivamente: o resumo de compra fica acessível, enquanto ferramentas avançadas e detalhes técnicos ficam recolhidos. Modais têm foco controlado, fechamento previsível, scroll interno e botões de ação alcançáveis em celular. Toda ação comunica sucesso, pendência ou erro no contexto, preservando o trabalho já feito.

Não publicar avaliações, selos, urgência, descontos de referência ou depoimentos fictícios. Manter contraste, navegação por teclado, alvos de toque adequados e respeito à redução de movimentos.

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

Referência: [Vercel for Platforms](https://vercel.com/docs/platforms).

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

Recebimento direto pelo tenant é a direção desejada, mas não substitui a confirmação da modalidade comercial e das permissões oferecidas por cada provider para plataformas. Homologar o fluxo OAuth/checkout por vendedor antes de prometer um modelo sem split ou sem exigências de habilitação.

A primeira integração candidata é Mercado Pago, sem reutilizar a credencial global de assinaturas. Outros providers entram por adapters homologados, com capacidades explícitas (Pix, cartão, boleto, estorno, parcelamento). A UI mostra somente providers configurados e métodos efetivamente disponíveis. Não criar botões que aparentem aceitar pagamentos sem uma integração funcional.

Requisitos obrigatórios:

- nunca armazenar dados de cartão;
- verificar assinatura e origem de webhooks;
- processar eventos com idempotência;
- manter histórico de tentativas e transições;
- não confiar no redirecionamento do navegador como confirmação de pagamento;
- conciliar valor esperado, valor pago, taxas e estornos;
- isolar credenciais por tenant.
- vincular pagamento ao tenant, vendedor, pedido, tentativa, moeda e valor esperado;
- separar tentativa de pagamento do pedido, permitindo nova tentativa sem duplicar pedido ou cobrança;
- conferir pagamento pelo servidor, inclusive após timeout, antes de repetir uma operação;
- tratar eventos duplicados, atrasados e fora de ordem, estorno parcial e contestação;
- congelar condições do checkout por prazo definido e tratar pagamento tardio sem liberar produção automaticamente;
- manter callbacks OAuth em origem controlada, com state de uso único, expiração e proteção contra redirecionamento aberto;
- não enviar dados completos do comprador, tokens ou arquivos privados para logs.

Referência de integração por vendedor: [Mercado Pago OAuth e checkout para plataformas](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).

## Modelo de dados preliminar

Entidades candidatas:

- `storefronts`;
- `tenant_module_entitlements`;
- `storefront_domains`;
- `storefront_theme_versions`;
- `storefront_sections`;
- `product_media`;
- `product_publications`;
- `collections`;
- `collection_products`;
- `carts`;
- `cart_items`;
- `store_customers` e suas sessões/verificações;
- `artwork_customization_sessions` e vínculos de arquivos/versionamento;
- `checkout_sessions`;
- `commerce_orders`;
- `commerce_order_items`;
- `commerce_order_status_history`;
- `payment_connections`;
- `commerce_payments` e tentativas;
- `commerce_payment_events`;
- `commerce_outbox_events`;
- `discount_coupons`;
- `inventory_reservations`.

O modelo final deverá ser definido em ADR antes das migrations. Orçamento e pedido permanecerão conceitos distintos. Um orçamento poderá originar um pedido, mas não será tratado implicitamente como pedido pago.

`payment_events` já existe para cobrança de assinaturas e não deve ser reutilizada implicitamente para vendas. Restringir relações entre loja, produto, comprador, carrinho, arte e pedido por tenant também nas constraints do banco, além das verificações na aplicação.

Estados comerciais, financeiros, de aprovação de arte, produção e entrega serão independentes. Definir uma matriz de transições e permissões, com histórico e identificadores externos. Um pedido pode estar pago, aguardando arte e ainda não enviado.

## Entrega sem sobrecarregar o projeto atual

- Começar por módulos internos coesos no mesmo repositório, sem impor microserviços ou reescrita do backoffice.
- Usar contratos de aplicação compartilhados para cálculo; não chamar endpoints administrativos com credenciais artificiais de comprador.
- Rotas, layouts e imports do storefront não devem introduzir editores, SDKs de pagamento ou código da loja nos bundles do precificador/dashboard.
- HTML do catálogo renderizado no servidor, imagens derivadas e cache apenas de dados publicados, com chaves e invalidação por tenant/versão.
- Carrinho, checkout, conta e artes privadas não entram em cache público.
- Processamento de imagem/IA/PDF e integrações lentas devem ter execução assíncrona durável, limites e progresso consultável.
- Gravar pedido e evento de trabalho na mesma transação (outbox); trabalhadores processam com idempotência, retentativas limitadas e recuperação manual.
- Receber pagamentos e registrar pedidos não depende de uma resposta imediata de Olist ou Melhor Envio. Falhas nessas integrações ficam visíveis para atendimento.
- Separar métricas, logs e limites de consumo do módulo, medindo baseline antes/depois. Separar deploys quando medições justificarem, não por antecipação.
- Recursos desativados não executam tarefas periódicas ou consultas de catálogo por tenant nas páginas atuais; checagem de habilitação deve ser barata.
- Limites de conexões, tempo de execução e concorrência serão dimensionados com testes. Modularização reduz impacto, mas não equivale a custo computacional zero.

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

As fases abaixo são blocos técnicos, não lançamentos comerciais isolados. O primeiro piloto vendável reúne as fases 0 a 3, upload/enquadramento/aprovação da fase 4 e a operação mínima da fase 7. Editor completo de loja, domínio próprio e múltiplos adapters podem evoluir após esse fluxo funcionar de ponta a ponta. A arquitetura multi-provider faz parte da fundação; cada novo provider só aparece como disponível após homologação.

### Fase 0 - Arquitetura

- Criar ADRs dos limites entre catálogo, orçamento, pedido e produção.
- Definir contratos internos dos motores de preço, frete e arte.
- Definir estratégia de publicação e snapshots.
- Definir modelo de cobrança da plataforma e recebimento do tenant.
- Definir habilitação opcional, sessões de comprador, matriz de estados, processamento assíncrono e plano de regressão.

### Fase 1 - Commerce Core

- Criar carrinho, checkout e pedido.
- Implementar snapshots comerciais.
- Reutilizar cálculo de preço, embalagem e frete.
- Criar estados e histórico de pedido.
- Criar sessões de personalização independentes de orçamento e persistência segura de carrinho.

### Fase 2 - Catálogo e storefront MVP

- Adicionar mídias e publicação de produtos.
- Publicar loja por subdomínio.
- Criar catálogo, produto, carrinho e checkout responsivos.
- Integrar a identidade visual básica do tenant.
- Implementar conta, recuperação de senha, endereços e histórico do comprador.

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
- Manter essas integrações opcionais; o tenant pode operar pedidos e produção internamente sem ERP.

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

## Checklist do piloto Ground Shop

Implementação inicial e instruções de ativação: [ecommerce-piloto.md](ecommerce-piloto.md).
Os itens abaixo representam o escopo completo; um item com partes ainda pendentes
continua desmarcado mesmo quando existe uma versão limitada no piloto.

- [x] Confirmar e-commerce como módulo opcional, independente do uso atual de orçamentos e ERP.
- [x] Examinar a referência local GroundShop_NuvemShop e distinguir tema visual de funcionalidades fornecidas pela Nuvemshop.
- [x] Registrar páginas públicas, administração, quantidade/artes por produto e requisitos de segurança e desempenho.
- [ ] Aprovar ADRs e migrations com módulo desativado por padrão, sem publicação automática de catálogo.
- [ ] Configurar Ground Shop como piloto via dados administrativos, sem hardcode no domínio compartilhado.
- [ ] Implementar publicação, mídia, categorias, busca e página de produto.
- [x] Implementar grupos de artes, cálculo autoritativo e resumo unitário/total com duas casas decimais.
- [ ] Implementar conta do comprador, verificação, recuperação, endereços e carrinho persistente.
- [ ] Integrar upload, edição, enquadramento e aprovação com snapshots estáveis.
- [ ] Implementar checkout, embalagem/frete, identificação do destinatário e tratamento de indisponibilidade.
- [ ] Homologar um provider de pagamento por tenant e painel de configuração, sem uso das credenciais de assinatura.
- [ ] Implementar confirmação, acompanhamento, atendimento e tarefas de produção/integração.
- [x] Validar isolamento com dois tenants de teste: publicação e compra em um tenant e rejeição de acesso cruzado no outro.
- [ ] Homologar Ground Shop antes da ativação pública; adicionar outros providers somente após testes próprios.

### Critérios de aceite e testes

- TDD para cálculos por quantidade/grupo, distribuição não divisível, faixas, centavos, descontos e mudanças de frete.
- Testes de integração com banco/RLS para isolamento de tenant, propriedade de carrinho, artes e pedidos; não somente mocks.
- Testes de checkout concorrente, alteração maliciosa de preço, tentativa repetida e valores divergentes.
- Testes de webhooks assinados, duplicados, fora de ordem, pagamento tardio e falha de integração após pagamento aprovado.
- Testes de cotas de IA entre múltiplos carrinhos, validação de uploads e acesso a arquivos de outro comprador/tenant.
- E2E desktop/mobile: busca → produto → grupos/artes → carrinho → identificação → frete → pagamento → acompanhamento.
- E2E de abandono/retomada, recuperação de senha, expiração de sessão e acessibilidade dos editores.
- Comparar bundles e latência das páginas atuais antes/depois; tenants sem módulo preservam seu fluxo e não recebem bibliotecas do storefront.
- Rotas futuras e pendências permanecem identificadas; não considerar entrega completa apenas por haver páginas ou simulações de pagamento.

## Direção recomendada

Iniciar com um storefront estruturado, configurável e especializado em personalizados. Não começar por um construtor visual totalmente livre.

Essa abordagem permite entregar uma loja funcional mais cedo, reaproveitar os recursos existentes com menor risco e manter um caminho de evolução para uma plataforma comparável a soluções generalistas, porém diferenciada pelo fluxo completo de criação, aprovação e produção de artes personalizadas.
