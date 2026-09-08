# Home e catálogo: referência GroundShop NuvemShop

## Referências locais

Consultados no projeto `GroundShop_NuvemShop`: `static/css/style-tokens.tpl`, `static/css/style-async.scss`, `templates/home.tpl` e `config/defaults.txt`.

O tema de referência permite reordenar diversas seções. Esta adaptação utiliza a sequência disponível no módulo atual: banner, categorias, produtos em destaque, coleção e benefícios. Não cria depoimentos, promoções fictícias, marcas ou seções sem conteúdo cadastrado.

## Planejado x realizado

- [x] Banner centralizado, largura máxima de 1216 px, altura máxima de 360 px e margens laterais.
- [x] Banner menor no celular e em orientação paisagem, sem mudar de altura ao alternar imagem com/sem texto.
- [x] Categorias com miniaturas circulares antes dos produtos; benefícios após as coleções.
- [x] Dark mode com fundo `#0d1117`, superfícies `#151b23`, destaque `#6fd0c9` e botões `#79d8d0`, conforme a referência. Light mode preserva a cor de botão configurada pelo tenant.
- [x] Fundo e sombra dos produtos preservados conforme a referência; elevação suave no hover, segunda foto quando disponível e foco visível.
- [x] Carrosséis e catálogo com quatro colunas no desktop e duas no celular; navegação por toque, botões e respeito à redução de movimento.
- [x] Ordenação por destaque, preço unitário e nome no catálogo, combinada com busca e categoria.
- [x] Testes da sequência da home, segunda imagem e preservação dos links privados; testes de ordenação e filtragem.
- [x] Navegador: loja pública e preview, claro/escuro, 1440/1920/390/320 px e paisagem 844 x 390. Próximo bloco visível, banner sem salto de altura e sem sobreposição dos controles.
- [x] Galeria e superfícies com transparência, hover e redução de movimento aprovadas. Compra simulada com upload, retoque, recorte, aprovação e checkout aprovada sem gravar pedidos ou criar sessão de comprador no preview.
- [x] 290 testes aprovados; seis testes de integração separados não executados nesta rodada. Lint, tipos e build de produção aprovados com limite de memória.

Não há migration, variável de ambiente nova ou alteração de dados de produção. As imagens usadas nas verificações são fixtures locais, e as configurações do banco de testes são restauradas ao final.
