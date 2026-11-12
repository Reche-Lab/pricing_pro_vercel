# Home e catálogo: referência GroundShop NuvemShop

## Referências locais

Consultados no projeto `GroundShop_NuvemShop`: `static/css/style-tokens.tpl`, `static/css/style-async.scss`, `templates/home.tpl` e `config/defaults.txt`.

O tema de referência permite reordenar diversas seções. Esta adaptação utiliza a sequência disponível no módulo atual: banner, categorias, produtos em destaque, coleção e benefícios. Não cria depoimentos, promoções fictícias, marcas ou seções sem conteúdo cadastrado.

## Planejado x realizado

### Tema Estúdio

#### Refinamento da Animação e Demonstração

Correção de continuidade em repouso:
- [x] Unificar a flutuação automática e o mouse num único relógio de frames e numa única transformação da imagem.
- [x] Conferir cursor parado, fora da vitrine, extremos da oscilação, pausa e aba oculta; manter movimento reduzido e toque estáticos.

Validação desta correção: 20 testes focados aprovados, lint, tipos e build com memória limitada. `COMMERCE_STUDIO_MOTION_ONLY=true` no script de navegador verifica somente a vitrine, sem repetir o editor: cursor parado durante um ciclo completo (430 frames), cursor fora da área (120 frames por cenário), posições fracionárias sem variações maiores que 0,45 px entre amostras após estabilizar o mouse, pausa/retomada, ausência de animação CSS concorrente, loja pública/prévia e temas claro/escuro, além de toque e movimento reduzido estáticos. Capturas da vitrine com cursor dentro e fora foram conferidas. A flutuação permanece acima da posição de repouso para preservar espaço para as legendas. O banco local é restaurado ao terminar; nenhuma migration ou variável adicional é necessária para a aplicação.

- [x] Suavizar flutuação e resposta ao mouse pelo tempo entre frames e pausar sem reiniciar a animação.
- [x] Frente e verso simultâneos, com a indicação de simulação e sem gravação ou aprovação de arte.
- [x] Tipografia local, texto em linhas ajustadas à área segura, circular e em espiral do centro para fora.
- [x] Fundo sólido ou degradê horizontal, diagonal, circular ou espiral, com até quatro cores editáveis.
- [x] Regressões de layout e movimento, pixels reais desktop/mobile, build e limites de memória preservados.

A flutuação automática e o mouse compartilham um único relógio `requestAnimationFrame` e uma única transformação da imagem, sem keyframes ou transições CSS concorrentes. A imagem continua recebendo posições fracionárias quando o cursor para ou sai da vitrine. O tempo acumulado é preservado ao pausar; aba oculta, interseção e desmontagem cancelam o loop, sem recuperar o tempo de ausência ao retomar. O retorno ao centro é gradual, e legendas permanecem imóveis. Dispositivos de toque e movimento reduzido continuam estáticos.

O exemplo usa uma mensagem de até 140 caracteres. O modo em linhas respeita quebras manuais e calcula larguras diferentes por linha dentro da região segura; o circular acompanha a borda e o espiral distribui caracteres por comprimento de arco, do centro para fora. Nenhuma dessas ações altera as artes reais do pedido. A demonstração continua importada somente no clique, sem IA, upload ou gravação.

Fontes adicionais servidas localmente e carregadas somente quando selecionadas: Caveat 700 (aproximadamente 51 KB) e DM Serif Display (aproximadamente 28 KB), obtidas do Google Fonts. Arquivos WOFF2 e respectivas licenças SIL OFL estão em `public/studio/fonts/`. Fontes oficiais: [Caveat](https://github.com/google/fonts/tree/main/ofl/caveat), [DM Serif Display](https://github.com/google/fonts/tree/main/ofl/dmserifdisplay). Os estilos Moderna e Marcante usam fontes do sistema. Não há nova dependência ou conexão do navegador com o Google Fonts.

Frente e verso têm ampliação individual, incluindo no celular: a versão ampliada é renderizada em 640 px somente ao abrir, mantendo as miniaturas em 256 px. Escape ou fechar devolve o foco ao botão de ampliação. Um aviso de simulação permanece visível; fontes indisponíveis recebem mensagem de erro em português, sem apagar o último exemplo válido.

Validação do refinamento: **862 testes na suíte de regressão**, seguidos de **14 testes focados** para a ampliação, tipografia, cores, navegação e suavização; lint sem avisos, tipos e build com memória limitada. O teste de navegador percorreu loja pública/prévia, claro/escuro, desktop/mobile de 320 a 1920 px, com dados temporários restaurados no PostgreSQL local. Confirmou 24 amostras consecutivas sem saltos maiores que 3 px ou desaparecimento da imagem, tempo de animação preservado durante pausa/retomada, os dois canvases não vazios ao mesmo tempo, diferenças reais de pixels em cada modo de texto/degradê, fontes locais efetivamente carregadas e zoom de ambas as faces em 640 px com retorno de foco. Foram inspecionadas capturas das composições em linhas, circular e espiral. Não houve acesso a integrações ou dados reais. Não é necessária migration nem nova variável de ambiente.

- [x] Preset opcional por tenant, mantendo lojas existentes no tema clássico até ativação explícita.
- [x] Abertura com imagens reais do catálogo, textura de apoio e foto própria opcional.
- [x] Profundidade, microinterações leves, pausa e respeito a movimento reduzido, toque e abas ocultas.
- [x] Demonstração de arte e frente/verso carregada somente por interação, sem IA nem gravação de dados.
- [x] Orçamento, carrinho e pagamento preservam superfícies tranquilas e suas regras atuais.
- [x] Testes de regressão, build e conferência desktop/mobile, claro/escuro e pixels dos modelos.

Validação do Estúdio: suíte completa com **850 testes aprovados**, seguida de **28 testes focados aprovados** após o cenário adicional de banners estáticos; uma integração de persistência aprovada em PostgreSQL isolado; tipos, lint e build de produção com heap limitado a 1024 MB. Os 62 casos condicionais da suíte completa permaneceram ignorados quando suas dependências não estavam configuradas. Não houve cobrança, publicação ou chamada real de IA/ERP/SMTP/Storage.

`scripts/commerce-studio-browser.mjs` validou o build final na loja pública e na prévia privada, nos modos claro/escuro e em 320/390/844/1280/1440/1920 px. Verificou imagens carregadas, ausência de overflow, um único H1, seleção de produto, pausa, movimento reduzido/toque, suspensão fora da tela e ausência do módulo dinâmico na rede antes do clique. As alterações de cor e de frente/verso foram confirmadas por pixels não vazios e assinaturas distintas no canvas real. O carrinho não monta a experiência de abertura. No celular estreito, as ações ficam compactas e o atalho redundante de orçamento da abertura é omitido, preservando o do menu. Produtos e configurações temporários do teste são restaurados ao finalizar.

#### Ativação do Estúdio

Em **Loja online > Loja e catálogo > Identidade e atendimento > Identidade visual**, escolha **Estúdio**, salve a loja e abra a prévia privada do tenant. É possível retornar ao **Clássico** sem perder banners, catálogo ou configurações de compra. Lojas existentes permanecem no clássico até essa seleção explícita. Não há nova migration nem variável de ambiente: a opção fica no JSON de configurações já isolado por tenant.

A foto própria é opcional, com o upload existente de PNG/JPEG/WebP de até 3 MB. Sem ela, os produtos reais aparecem sobre uma textura ilustrativa. O visitante pode trocar o destaque e pausar a abertura. Toque, movimento reduzido, aba oculta e vitrine fora da tela suspendem o movimento. Não há Three.js, vídeo automático, polling ou requisição de IA nesta experiência.

A demonstração **Ver como fica** só aparece para produtos personalizados com geometria e modelo frente/verso configurados. O módulo é importado apenas no clique; usa uma arte-exemplo gerada localmente em canvas e os modelos existentes, com mensagem, cor e seleção de produto. Não grava dados, não aprova artes nem adiciona produtos ao carrinho. A personalização real continua na página do produto. Imagens de acabamento são ilustrativas, sem promessas de fabricação ou certificados não comprovados. Banners continuam disponíveis abaixo das vitrines como campanhas.

#### Asset e Proveniência

Arquivo: `public/studio/paper-v1.webp`. Textura de papel gerada com o recurso integrado de geração de imagens, não uma fotografia da empresa. Otimização mecânica com Sharp: WebP, largura de 1600 px, qualidade 76, aproximadamente 8 KB. Produtos e modelos continuam vindo do catálogo do tenant; a geração não substitui suas fotos. Não foram usados scripts externos de geração nem novas dependências.

Prompt utilizado:

> Use case: photorealistic-natural. Asset type: neutral photographic backdrop for a customizable-print-products ecommerce studio theme, not a product photo or a factory photograph. Create one wide panoramic, high-resolution overhead photograph of a continuous pale neutral cool-white matte paper surface, with authentic subtle paper fibers, very restrained graphite printing registration/crop marks only near the far outer corners, and tiny overlapping cyan and coral colored paper edges at the extreme corners. The entire middle 85 percent is uninterrupted clean paper with almost invisible physical texture, suitable for readable website typography and real catalog product images placed on top. Natural diffuse window lighting, soft authentic edge shadows, meticulous tactile print-studio material, professional contemporary design. The surface should fill the complete frame edge to edge, no frame or border. No actual products, no equipment, no people, no letters, no numbers, no logos, no text, no watermarks, no gradients, no glow, no floating shapes, no bokeh. Do not depict a real company or business premises. Wide landscape composition approximately 2.4:1.

### Menu de categorias

- [x] Dropdown por categoria, com produtos publicados, miniaturas, preços e acesso ao catálogo completo da categoria.
- [x] Hover no desktop, seleção por toque, indicação da categoria ativa e fechamento por fora/Escape.
- [x] Navegação por teclado, foco devolvido ao gatilho e dropdown independente da faixa rolável do menu.
- [x] Links preservam preview e domínio próprio; o menu de produtos não adiciona consultas nem pré-carregamento dos links de cada produto.
- [x] Testes de regressão, temas claro/escuro e conferência desktop/mobile.

Esta melhoria usa o catálogo já publicado do tenant e não exige migration ou nova variável de ambiente.

### Campanhas e artes prontas no menu

- [x] Campanhas em dropdown com capa, nome, quantidade de artes e link para sua coleção.
- [x] Artes prontas com miniaturas, categorias e subcategorias, além do acesso à galeria completa.
- [x] Biblioteca carregada sob demanda e compartilhada entre os dois dropdowns, sem buscar arquivos originais.
- [x] Atalhos de arte/categoria aplicam os filtros corretos na galeria; os caminhos de preview e domínio próprio são preservados.
- [x] Regressões e verificação em navegador desktop/mobile, claro/escuro; filtros e estados de erro cobertos por testes.

As opções usam as APIs existentes e o conteúdo permitido para o tenant e o modo de navegação. Não há migration nem nova configuração obrigatória.

Validação da ampliação: 799 testes unitários (incluindo 20 casos focados nos menus e na galeria), 19 testes de integração com PostgreSQL local, lint, tipos e build de produção com memória limitada. `scripts/commerce-menu-browser.mjs` verificou loja pública e preview em 1440/1920/390/320 px e paisagem 844 × 390, nos dois temas, com hover, toque, foco/Escape, carregamento de miniaturas, rolagem limitada e navegação real para produto, campanha, categoria e arte específica. O teste usa campanhas, categorias e produtos temporários no banco local isolado, intercepta somente as miniaturas de artes para não acessar o Storage e restaura o catálogo ao finalizar. Os testes unitários cobrem também falha/retentativa e isolamento de dados entre tenants. Nomes longos ficam limitados no gatilho, e o cabeçalho do dropdown é compacto em telas baixas. Nenhum dado de produção foi alterado.

### Histórico da home

- [x] Banner centralizado, largura máxima de 1216 px e margens laterais. Altura ampliada para até 480 px no desktop e 380 px no celular, para reduzir as sobras laterais de imagens exibidas inteiras.
- [x] Banner menor no celular e em orientação paisagem, sem mudar de altura ao alternar imagem com/sem texto.
- [x] Categorias com miniaturas circulares antes dos produtos; benefícios após as coleções.
- [x] Dark mode com fundo `#0d1117`, superfícies `#151b23`, destaque `#6fd0c9` e botões `#79d8d0`, conforme a referência. Light mode preserva a cor de botão configurada pelo tenant.
- [x] Fundo e sombra dos produtos preservados conforme a referência; elevação suave no hover, segunda foto quando disponível e foco visível.
- [x] Carrosséis e catálogo com quatro colunas no desktop e duas no celular; navegação por toque, botões e respeito à redução de movimento.
- [x] Ordenação por destaque, preço unitário e nome no catálogo, combinada com busca e categoria.
- [x] Testes da sequência da home, segunda imagem e preservação dos links privados; testes de ordenação e filtragem.
- [x] Navegador da versão compacta: loja pública e preview, claro/escuro, 1440/1920/390/320 px e paisagem 844 x 390.
- [x] Galeria e superfícies com transparência, hover e redução de movimento aprovadas. Compra simulada com upload, retoque, recorte, aprovação e checkout aprovada sem gravar pedidos ou criar sessão de comprador no preview.
- [x] 290 testes aprovados; seis testes de integração separados não executados nesta rodada. Lint, tipos e build de produção aprovados com limite de memória.

Não há migration, variável de ambiente nova ou alteração de dados de produção. As imagens usadas nas verificações são fixtures locais, e as configurações do banco de testes são restauradas ao final.

## Ajuste de altura e controles

- [x] Ampliar a altura preservando a proporção da arte e a largura do componente.
- [x] Remover contador numérico e botão de reproduzir/pausar; manter setas, indicadores e gesto de deslizar.
- [x] Interromper a rotação automática após navegação manual, além das pausas por hover/foco e redução de movimento.
- [x] 291 testes aprovados; seis testes de integração separados não executados nesta rodada. Build, lint e tipos aprovados. Navegador validado na loja pública e no preview, claro/escuro, desktop/celular/paisagem, sem contador ou controle de reprodução e sem sobreposição.

## Fundo do carrossel

- [x] Fundo transparente, incluindo banners exibidos por inteiro, sem faixas do componente contrastando com a loja. As imagens e suas proporções permanecem intactas.
- [x] Playwright validado na loja pública e no preview, claro/escuro, desktop/celular/paisagem, com verificação de transparência, ausência de overlay em banners sem texto e estabilidade de altura. Capturas de tela conferidas. Sem migration.
