# Home e catálogo: referência GroundShop NuvemShop

## Referências locais

Consultados no projeto `GroundShop_NuvemShop`: `static/css/style-tokens.tpl`, `static/css/style-async.scss`, `templates/home.tpl` e `config/defaults.txt`.

O tema de referência permite reordenar diversas seções. Esta adaptação utiliza a sequência disponível no módulo atual: banner, categorias, produtos em destaque, coleção e benefícios. Não cria depoimentos, promoções fictícias, marcas ou seções sem conteúdo cadastrado.

## Planejado x realizado

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
