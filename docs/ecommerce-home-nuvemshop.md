# Home e catálogo: referência GroundShop NuvemShop

## Referências locais

Consultados no projeto `GroundShop_NuvemShop`: `static/css/style-tokens.tpl`, `static/css/style-async.scss`, `templates/home.tpl` e `config/defaults.txt`.

O tema de referência permite reordenar diversas seções. Esta adaptação utiliza a sequência disponível no módulo atual: banner, categorias, produtos em destaque, coleção e benefícios. Não cria depoimentos, promoções fictícias, marcas ou seções sem conteúdo cadastrado.

## Planejado x realizado

### Rodapé e Créditos da Plataforma

- [x] Rodapé independente, com marca do tenant, miniaturas reais do catálogo e convites para o Estúdio/orçamento somente nos fluxos disponíveis. Carrinho, checkout, orçamentos, conta e acompanhamento mantêm uma versão sem faixa promocional para não desviar a atenção da tarefa.
- [x] Contato e retirada usam os dados configurados. Informações de pagamento citam somente o provedor habilitado, sem inventar bandeiras, parcelas ou selos de garantia.
- [x] Grupos de navegação recolhidos no celular, abertos por padrão no desktop; atendimento sempre visível, links de domínio próprio/prévia preservados e botão de voltar ao topo com movimento reduzido e retorno de foco.
- [x] Entrada discreta ao chegar ao rodapé, sublinhados/setas no hover/foco e miniaturas com inclinação leve, sem loop contínuo; respeitar a configuração de movimento e a preferência do dispositivo.
- [x] Assinatura compartilhada **Plataforma Liaflow · Criação rechelab** na loja, landing da plataforma e área administrativa. Links externos com nova aba, `noopener noreferrer`, contraste e foco visível.
- [x] 931 testes unitários de regressão aprovados, mais 20 testes focados após os refinamentos finais, incluindo checkout discreto. Tipos e lint aprovados.
- [x] Chrome com o componente real: claro/escuro, 1440/390/320 px e paisagem 844×390; links públicos com base de domínio próprio e prévia privada, logo/catálogo decodificados, miniaturas quadradas sem esticar, disclosure, foco por teclado, retorno ao topo/foco, créditos, nome longo e movimento desativado/reduzido, sem overflow. Capturas inspecionadas. Roteiro: `scripts/commerce-footer-browser.mjs`, em harness local isolado sem banco/APIs; a camada de navegação Next é substituída por âncoras normais.
- [x] Build de produção com lint/tipos aprovado e memória limitada. Assinatura conferida na landing real do build Next.js em 1440/320 px, com links externos corretos, limites da tela respeitados e sem exceções no navegador. A área administrativa foi coberta pelo teste do AppShell; não houve acesso a dados ou serviços de produção.

Não há migration, nova variável de ambiente, serviço remoto ou dependência de produção. Os destinos públicos da assinatura ficam centralizados em `src/lib/platform-branding.ts`: Liaflow em `https://liaflow-calcula.vercel.app/` e rechelab em `https://reche-lab-portfolio.vercel.app/`. Quando a plataforma ganhar domínio próprio, atualizar o primeiro endereço nesse único arquivo e fazer o deploy. Esses links não alteram domínios das lojas nem o isolamento dos tenants.

### Tema Estúdio

#### Pulsação dos Produtos na Abertura

- [x] Substituir o acompanhamento do mouse e a flutuação por duas batidas suaves: escala de até 3,5% na primeira e 2,2% na segunda, com repouso entre ciclos de 2,4 segundos.
- [x] Preservar centro, proporções e legenda imóvel, sem piscar ou movimentar o restante da página. Um único relógio mantém continuidade ao pausar/retomar.
- [x] Permitir a pulsação também no celular, com o botão de pausa acessível; respeitar movimento reduzido, configuração do tenant, aba oculta, interseção e desmontagem.
- [x] TDD: novos testes primeiro falhando, depois 22 testes focados aprovados, incluindo continuidade em 60/120 Hz e fronteiras dos ciclos. Atualizar as expectativas do roteiro de navegador para o novo movimento.
- [x] 38 testes focados aprovados, tipos e lint aprovados. Chrome com o componente real em ambiente local isolado: 1440/390/320 px, claro/escuro, imagens decodificadas, escala contínua e centralizada, repouso, pausa/retomada, troca de produto, movimento reduzido e ausência de overflow. Capturas inspecionadas. A validação visual foi do componente isolado, sem banco ou APIs; o roteiro completo `commerce-studio-browser.mjs` foi atualizado, mas não reexecutado nesta rodada.

Sem migration, nova configuração ou dependência de produção. A opção existente **Ativar movimentos suaves** controla o efeito. Esta pulsação substitui os comportamentos históricos de mouse/flutuação e toque estático descritos nas validações anteriores abaixo.

#### Entrada, Artes Prontas e Última Composição

- [x] Trocar a chamada por **Crie sua arte aqui**, com contraste e um realce suave de três ciclos, sem piscar o texto; pausa e movimento reduzido suspendem o efeito.
- [x] Em **Fundo > Imagem**, abrir a biblioteca com pesquisa, categorias e artes vinculadas ao produto, quando habilitada pela loja.
- [x] Liberar como fundo apenas originais editáveis; conferir publicação, tenant, vínculo com o produto, integridade e versão também ao continuar.
- [x] Guardar a composição editável e a imagem em IndexedDB, separadas por tenant, loja/prévia e aba, por até 24 horas enquanto a sessão da aba for mantida, com limpeza de expiradas na próxima gravação.
- [x] Recuperar a composição ao voltar/recarregar, sem repetir a demonstração, e oferecer **Retomar** e **Nova arte**. Um rascunho antigo não substitui uma gravação mais recente.
- [x] Incluir no produto o retorno ao Estúdio. A troca de produto mantém a composição e gera um novo arquivo nas medidas correspondentes, sem aprovar automaticamente nem modificar o item anterior.
- [x] Limpar o cache da loja ao sair da conta, sem afetar o rascunho de outro tenant; rotacionar o identificador de acesso caso o navegador bloqueie a limpeza física.
- [x] Testes de regressão, integração com PostgreSQL, build e conferência de biblioteca/cache em desktop/mobile.

O cache é funcional e local à aba: não contém credenciais nem transfere uma aprovação entre produtos. `sessionStorage` guarda somente um identificador aleatório da aba; o arquivo não ocupa a pequena cota desse armazenamento. Se IndexedDB estiver bloqueado/sem espaço, há fallback de memória limitado e aviso para não fechar/recarregar a aba. A última composição é gravada antes de navegar para o produto. **Nova arte** mantém a última disponível até uma nova edição substituí-la. Originais não editáveis continuam disponíveis pelo fluxo tradicional de artes prontas do produto, não pelo Estúdio. A biblioteca usa o endpoint existente de seleção com `target: "studio"`, que retorna a fonte autorizada sem criar cópias de comprador; não adiciona upload nem gravação automática no servidor. Não há migration nem variável de ambiente nova.

Validação: suíte de regressão com **896 testes aprovados** (63 condicionais ignorados), seguida de **37 testes focados aprovados** após os refinamentos de interação/limpeza, **30 testes de integração** com PostgreSQL isolado, lint e build de produção. `COMMERCE_STUDIO_CACHE_ONLY=true` em `scripts/commerce-studio-purchase-browser.mjs` percorreu loja/prévia em 320/390/1440 px, claro/escuro, usando apenas dados e Storage locais. Conferiu IndexedDB real após recarregar, imagem, cores, escala e deslocamentos preservados; exportação de outro produto em 496 px versus 709 px do primeiro, aprovação independente e aprovação anterior intacta; galeria com imagens decodificadas e seleção de origem autorizada; carrinho, checkout local sem cobrança, acesso privado e limpeza ao sair. O destaque do botão foi verificado com pausa e movimento reduzido. Capturas da entrada e da biblioteca foram inspecionadas. Uma atualização de aviso durante a captura do clique restaurava o valor antigo de inputs controlados; os controles agora leem a alteração antes dessa atualização visual. O modo dev reiniciou por atingir o limite de memória, por isso a conferência final foi feita no build de produção local, com os seis cenários aprovados. Configurações e produtos temporários foram restaurados ao finalizar.

#### Demonstração Guiada de Abertura

- [x] Ao abrir o Estúdio, mostrar uma mensagem mais longa, texto circular, texto em espiral, três cores e fundo em espiral.
- [x] Finalizar com “Agora crie você mesmo a sua arte” e um botão para editar a mensagem selecionada.
- [x] Permitir pular e interromper imediatamente ao editar, sem sobrescrever a criação do cliente.
- [x] Pausar fora da tela/aba oculta, respeitar movimento reduzido e cancelar temporizadores ao sair.
- [x] Testes de regressão, build e conferência dos estágios reais em desktop/mobile.

A abertura dura cerca de 15 segundos, podendo variar conforme a renderização das duas faces entre etapas. Não usa IA, não faz upload, não grava arte, não aprova e não adiciona nada ao carrinho. O botão de continuar com a arte fica indisponível durante a demonstração; ao final, o cliente pode aproveitar o exemplo ou criar algo próprio. “Pular” restaura o ponto de partida e seleciona a mensagem para edição. Interagir diretamente preserva a composição que estava sendo mostrada e cancela os próximos passos automáticos. Com movimento reduzido, o convite para criar aparece diretamente, sem reprodução automática. A demonstração é carregada somente na abertura já existente do Estúdio e não exige migration ou variável de ambiente.

Validação: **885 testes aprovados** (62 condicionais ignorados), lint e build de produção com tipos verificados e memória limitada. `COMMERCE_STUDIO_INTRO_ONLY=true` em `scripts/commerce-studio-purchase-browser.mjs` verifica os cinco estágios com assinaturas de pixels diferentes no canvas real, mensagem final, foco e seleção do texto, pular, interrupção ao editar e movimento reduzido. Os cenários cobrem loja pública/prévia, temas claro/escuro e 320/390/1440 px, sem requisições de gravação de arte/pedido/pagamento ou overflow horizontal. As capturas dos estágios e do convite final foram inspecionadas em desktop/mobile. O teste utiliza apenas PostgreSQL isolado, imagens sintéticas e configurações temporárias restauradas ao final.

#### Imagem de Fundo e Continuidade na Compra

- [x] Campo de mensagem vazio (ou só com espaços/quebras) não insere texto substituto, em linhas, círculo ou espiral; a regra vale tanto para a prévia quanto para a composição salva. Testes cobrem os três modos e o envio de uma composição com imagem e mensagem vazia.

- [x] Imagem PNG/JPEG/WebP validada, com tamanho, deslocamento, encaixe e cor para áreas descobertas.
- [x] Composição de compra nas medidas de corte a 300 dpi, preservando a disposição da prévia e alertando sobre imagens pouco nítidas.
- [x] Salvar pela sessão do tenant e encaminhar ao produto com a arte anexada, sem aprovação automática nem alteração de outros itens.
- [x] Fluxo equivalente na prévia privada, sem gravação real, e retomada de tentativas após falha parcial.
- [x] Testes unitários, integração local de compra/arte, build e verificação desktop/mobile.

Validação da continuidade: **879 testes aprovados**, com 62 testes condicionais ignorados por dependências de ambiente não configuradas; lint, tipos e build de produção com memória limitada. `scripts/commerce-studio-purchase-browser.mjs` usa PostgreSQL isolado e emula somente o protocolo privado do Storage em `127.0.0.1:55440`. Percorre loja pública/prévia em 320/390/1440 px e temas claro/escuro, com imagens sintéticas. Confere pixels das duas faces, imagem inteira sem distorção, cor de preenchimento e lados preservados no arquivo salvo, corte de 60 mm em 709 × 709 px, vínculo por tenant/produto/sessão e bloqueio de acesso por outro comprador. Também verifica reabertura na mesma sessão, aprovação explícita, carrinho e criação de pedido local com prova aprovada e pagamento pendente, sem cobrança. A prévia não grava linhas de arte no banco nem objetos no Storage. Capturas desktop/mobile foram inspecionadas; um overflow causado pelo input oculto de upload foi corrigido. As configurações e produtos temporários são restaurados ao finalizar. Não houve acesso a IA, ERP, SMTP, pagamentos ou Storage reais.

#### Refinamento da Animação e Demonstração

Correção de continuidade em repouso:
- [x] Unificar a flutuação automática e o mouse num único relógio de frames e numa única transformação da imagem.
- [x] Conferir cursor parado, fora da vitrine, extremos da oscilação, pausa e aba oculta; manter movimento reduzido e toque estáticos.

Validação desta correção: 20 testes focados aprovados, lint, tipos e build com memória limitada. `COMMERCE_STUDIO_MOTION_ONLY=true` no script de navegador verifica somente a vitrine, sem repetir o editor: cursor parado durante um ciclo completo (430 frames), cursor fora da área (120 frames por cenário), posições fracionárias sem variações maiores que 0,45 px entre amostras após estabilizar o mouse, pausa/retomada, ausência de animação CSS concorrente, loja pública/prévia e temas claro/escuro, além de toque e movimento reduzido estáticos. Capturas da vitrine com cursor dentro e fora foram conferidas. A flutuação permanece acima da posição de repouso para preservar espaço para as legendas. O banco local é restaurado ao terminar; nenhuma migration ou variável adicional é necessária para a aplicação.

- [x] Suavizar flutuação e resposta ao mouse pelo tempo entre frames e pausar sem reiniciar a animação.
- [x] Frente e verso simultâneos, com a indicação de simulação, sem gravação durante os ajustes nem aprovação automática.
- [x] Tipografia local, texto em linhas ajustadas à área segura, circular e em espiral do centro para fora.
- [x] Fundo sólido ou degradê horizontal, diagonal, circular ou espiral, com até quatro cores editáveis.
- [x] Regressões de layout e movimento, pixels reais desktop/mobile, build e limites de memória preservados.

A flutuação automática e o mouse compartilham um único relógio `requestAnimationFrame` e uma única transformação da imagem, sem keyframes ou transições CSS concorrentes. A imagem continua recebendo posições fracionárias quando o cursor para ou sai da vitrine. O tempo acumulado é preservado ao pausar; aba oculta, interseção e desmontagem cancelam o loop, sem recuperar o tempo de ausência ao retomar. O retorno ao centro é gradual, e legendas permanecem imóveis. Dispositivos de toque e movimento reduzido continuam estáticos.

O Estúdio usa uma mensagem opcional de até 140 caracteres. O modo em linhas respeita quebras manuais e calcula larguras diferentes por linha dentro da região segura; o circular acompanha a borda e o espiral distribui caracteres por comprimento de arco, do centro para fora. Durante a edição, a composição fica local no navegador, sem IA ou gravação. Somente **Usar esta arte no produto** salva uma nova arte na sessão privada do comprador e abre a página do produto para revisão e aprovação explícitas.

Fontes adicionais servidas localmente e carregadas somente quando selecionadas: Caveat 700 (aproximadamente 51 KB) e DM Serif Display (aproximadamente 28 KB), obtidas do Google Fonts. Arquivos WOFF2 e respectivas licenças SIL OFL estão em `public/studio/fonts/`. Fontes oficiais: [Caveat](https://github.com/google/fonts/tree/main/ofl/caveat), [DM Serif Display](https://github.com/google/fonts/tree/main/ofl/dmserifdisplay). Os estilos Moderna e Marcante usam fontes do sistema. Não há nova dependência ou conexão do navegador com o Google Fonts.

Frente e verso têm ampliação individual, incluindo no celular: a versão ampliada é renderizada em 640 px somente ao abrir, mantendo as miniaturas em 256 px. Escape ou fechar devolve o foco ao botão de ampliação. Um aviso de simulação permanece visível; fontes indisponíveis recebem mensagem de erro em português, sem apagar o último exemplo válido.

Validação do refinamento: **862 testes na suíte de regressão**, seguidos de **14 testes focados** para a ampliação, tipografia, cores, navegação e suavização; lint sem avisos, tipos e build com memória limitada. O teste de navegador percorreu loja pública/prévia, claro/escuro, desktop/mobile de 320 a 1920 px, com dados temporários restaurados no PostgreSQL local. Confirmou 24 amostras consecutivas sem saltos maiores que 3 px ou desaparecimento da imagem, tempo de animação preservado durante pausa/retomada, os dois canvases não vazios ao mesmo tempo, diferenças reais de pixels em cada modo de texto/degradê, fontes locais efetivamente carregadas e zoom de ambas as faces em 640 px com retorno de foco. Foram inspecionadas capturas das composições em linhas, circular e espiral. Não houve acesso a integrações ou dados reais. Não é necessária migration nem nova variável de ambiente.

- [x] Preset opcional por tenant, mantendo lojas existentes no tema clássico até ativação explícita.
- [x] Abertura com imagens reais do catálogo, textura de apoio e foto própria opcional.
- [x] Profundidade, microinterações leves, pausa e respeito a movimento reduzido, toque e abas ocultas.
- [x] Demonstração de arte e frente/verso carregada somente por interação, sem IA nem gravação durante os ajustes.
- [x] Orçamento, carrinho e pagamento preservam superfícies tranquilas e suas regras atuais.
- [x] Testes de regressão, build e conferência desktop/mobile, claro/escuro e pixels dos modelos.

Validação do Estúdio: suíte completa com **850 testes aprovados**, seguida de **28 testes focados aprovados** após o cenário adicional de banners estáticos; uma integração de persistência aprovada em PostgreSQL isolado; tipos, lint e build de produção com heap limitado a 1024 MB. Os 62 casos condicionais da suíte completa permaneceram ignorados quando suas dependências não estavam configuradas. Não houve cobrança, publicação ou chamada real de IA/ERP/SMTP/Storage.

`scripts/commerce-studio-browser.mjs` validou o build final na loja pública e na prévia privada, nos modos claro/escuro e em 320/390/844/1280/1440/1920 px. Verificou imagens carregadas, ausência de overflow, um único H1, seleção de produto, pausa, movimento reduzido/toque, suspensão fora da tela e ausência do módulo dinâmico na rede antes do clique. As alterações de cor e de frente/verso foram confirmadas por pixels não vazios e assinaturas distintas no canvas real. O carrinho não monta a experiência de abertura. No celular estreito, as ações ficam compactas e o atalho redundante de orçamento da abertura é omitido, preservando o do menu. Produtos e configurações temporários do teste são restaurados ao finalizar.

#### Ativação do Estúdio

Em **Loja online > Loja e catálogo > Identidade e atendimento > Identidade visual**, escolha **Estúdio**, salve a loja e abra a prévia privada do tenant. É possível retornar ao **Clássico** sem perder banners, catálogo ou configurações de compra. Lojas existentes permanecem no clássico até essa seleção explícita. Não há nova migration nem variável de ambiente: a opção fica no JSON de configurações já isolado por tenant.

A foto própria é opcional, com o upload existente de PNG/JPEG/WebP de até 3 MB. Sem ela, os produtos reais aparecem sobre uma textura ilustrativa. O visitante pode trocar o destaque e pausar a abertura. Toque, movimento reduzido, aba oculta e vitrine fora da tela suspendem o movimento. Não há Three.js, vídeo automático, polling ou requisição de IA nesta experiência.

A experiência **Crie sua arte aqui** só aparece para produtos personalizados com geometria e modelo frente/verso configurados. O módulo é importado apenas no clique; usa canvas e os modelos existentes, com mensagem opcional, imagem, cor e seleção de produto. **Fundo > Imagem** aceita PNG/JPEG/WebP de até 3 MB, 25 megapixels e 10.000 px por lado, com checagem de assinatura. A imagem mantém proporção; permite encaixe inteiro, preenchimento, tamanho, deslocamento e uma cor sólida nas áreas descobertas. A nitidez é estimada pela imagem original, não pela resolução artificial da composição.

**Usar esta arte no produto** gera uma composição nas medidas de corte a 300 dpi e usa o upload/enquadramento privados já existentes. O arquivo final é PNG, com fallback para WebP quando necessário, limitado a 3 MB; produtos que exigem mais de 4.096 px por lado ou 16 megapixels recebem orientação para enviar arte pronta, sem reduzir silenciosamente a resolução. A composição é achatada: texto, imagem e fundo passam a ser uma arte única que pode ser retocada ou reenquadrada pelas ferramentas existentes. Não há aprovação automática, inclusão automática no carrinho ou cobrança.

O link de continuidade contém apenas o ID da arte, nunca a imagem ou credenciais. A página do produto só seleciona esse ID se estiver na lista de artes da sessão e pertencer ao produto atual. Na loja pública, a arte permanece disponível na mesma sessão ao reabrir o link; a prévia privada continua somente em memória e perde a simulação ao recarregar. Se o preparo falhar depois do envio, tentar novamente reaproveita a mesma arte. Não há nova migration, dependência ou variável de ambiente: o fluxo usa o bucket privado `artwork-production` e as configurações de Storage já existentes.

Imagens de acabamento são ilustrativas, sem promessas de fabricação ou certificados não comprovados. Banners continuam disponíveis abaixo das vitrines como campanhas.

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

## Avaliações Google por loja

- [x] Configuração independente por tenant em Loja online → Avaliações Google, com chave criptografada, Place ID, título e limite diário.
- [x] Salvar → testar com prévia → confirmar estabelecimento → ativar; mudar credencial/perfil exige novo teste. Remoção com confirmação digitada.
- [x] Seção opcional na home e no preview, responsiva nos dois temas; até cinco avaliações por relevância, autores, datas e links individuais, sem filtrar somente notas positivas.
- [x] Consulta sob demanda quando a seção está visível, limite diário atômico por tenant, proteção de origem/rate limit, timeout e fallback para o perfil. Sem cache permanente de conteúdo Google nem credencial no cliente.
- [x] Crédito Google Maps com assets oficiais inalterados e página pública de informações/privacidade por loja.
- [x] Regressões: 920 testes unitários, quatro testes de integração PostgreSQL, lint e build de produção com tipos aprovados e memória limitada.
- [x] Navegador: configuração, chave em branco após salvar, criptografia no banco local, teste/prévia, confirmação, ativação e remoção segura; loja pública/preview, claro/escuro e 1440/390/320 px, sem overflow. Logo oficial carregado a 18 px, autoria, fontes e página de privacidade conferidos. Script: `scripts/commerce-google-reviews-browser.mjs`.
- [ ] Ação do administrador: aplicar migration/deploy, cadastrar credenciais reais, testar o perfil e ativar. Google foi simulado nas verificações locais; nenhuma consulta real, cobrança ou alteração em produção foi realizada.

### Ativação e credenciais

1. Aplicar `supabase/migrations/0078_commerce_google_reviews.sql` no mesmo banco da aplicação e realizar o deploy.
2. No Google Cloud, selecionar um projeto com faturamento, habilitar **Places API (New)** e criar uma chave restrita a essa API. A chamada é do servidor: restrição por referenciador HTTP de navegador não se aplica; restrição por IP precisa corresponder à saída da hospedagem. Não compartilhar a chave no chat.
3. Em **Loja online → Avaliações Google**, informar chave e Place ID do perfil público da empresa. Salvar, testar, conferir a prévia e confirmar o estabelecimento antes de ativar. Não é OAuth nem exige acesso à conta Meu Negócio.
4. Ajustar o limite diário e cotas/alertas no Google Cloud. O limite da aplicação inclui testes/falhas e renova à meia-noite UTC; não é teto de cobrança do provedor. O pedido de `reviews` utiliza o SKU Enterprise + Atmosphere, que pode gerar custos. A API fornece no máximo cinco comentários por relevância, não todo o histórico.

Não há nova variável global: a criptografia utiliza `APP_ENCRYPTION_KEY`, já exigida pela plataforma. Nunca rotacionar essa chave sem um processo de migração dos segredos existentes. A seção permanece desativada até configuração e teste explícitos. A migration não altera configurações anteriores nem ativa a integração.

Os textos, autores, fotos, notas e respostas brutas do Google não são persistidos em SQL, logs ou armazenamento do navegador; somente configuração, teste, auditoria e contagem de chamadas. Não se publica `aggregateRating` para prometer estrelas nos resultados de pesquisa. A integração é de leitura: não cria, altera ou responde avaliações.

Referências: [Place Details e FieldMask](https://developers.google.com/maps/documentation/places/web-service/place-details), [políticas de atribuição e armazenamento](https://developers.google.com/maps/documentation/places/web-service/policies), [segurança de chaves](https://developers.google.com/maps/api-security-best-practices), [Place ID](https://developers.google.com/maps/documentation/places/web-service/place-id), [custos e cotas](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing). As imagens em `public/google-maps` são os PNGs 2x oficiais, sem alteração, do [pacote de atribuição Google Maps](https://developers.google.com/static/maps/documentation/images/Google_Maps_Attribution_Assets.zip), com altura visual de 18 px e área livre própria.

## Assistente da Loja — Planejado e Realizado

- [x] Módulo opcional por tenant, desativado por padrão; painel e formulários carregados sob demanda, sem substituir o atendimento humano ou o checkout.
- [x] OpenRouter com ferramentas restritas, catálogo publicado e aliases, cálculo real por quantidade/artes, estimativa de frete com seguro e produção separada.
- [x] Propostas com validade, confirmação explícita, preservação do carrinho, verificação de revisão/preço e idempotência. A IA não pode cobrar, aprovar arte, emitir NF nem acessar ERP.
- [x] Formulários seguros existentes para login por e-mail, faturamento/entrega e orçamento/PDF; esses dados e códigos não entram no modelo. Consultas particulares limitadas à conta autenticada.
- [x] Nome, tom, FAQ, informações oficiais e documentos PDF privados aprovados pelo administrador. Ficha/banco são apresentados em cartões oficiais, sem serem reescritos pela IA.
- [x] Laboratório administrativo sem escrita, teste de conexão e ativação com confirmação. Alterar configuração/política exige novo teste.
- [x] Histórico criptografado por tenant/sessão/conta, ocultação parcial de padrões sensíveis, encaminhamento explícito à equipe, métricas e exclusão pelo cliente. A ocultação não substitui os cuidados com dados pessoais.
- [x] Superadmin define modelo autorizado e limites de chamadas/tokens/US$ mensais, mais limite diário por sessão; reserva atômica antes de chamar o provedor.
- [x] Retenção configurável de 1–90 dias, bloqueio imediato após expiração e limpeza privada horária em lotes via Vercel Schedules.
- [x] Regressão geral: 945 testes aprovados; seis testes de integração PostgreSQL do assistente aprovados separadamente, incluindo isolamento, criptografia, cotas concorrentes, revisão/preço, confirmação única e consulta do carrinho sem escrita. Demais integrações condicionais da suíte não foram executadas nesta rodada.
- [x] Lint, tipos e build de produção aprovados com uma CPU e heap limitado. Migration 0079 executada e reexecutada no banco isolado, incluindo a criação privada do bucket em uma tabela Storage simulada.
- [x] Playwright: loja nos temas claro/escuro em 1440×1000, 390×844, 320×740 e 844×390, imagens carregadas, sem overflow, chat → confirmação → formulário real de revisão → orçamento/PDF. Configuração em 1440/390/320 px, laboratório, salvar, testar, aprovar e ativar. APIs de provedor simuladas, sem chamada real de IA, envio de e-mail ou cobrança. Script: `scripts/commerce-assistant-browser.mjs`.
- [ ] Administrador aplicar migration/deploy, revisar conteúdos e documentos reais, configurar limites e homologar as respostas com OpenRouter antes de ativar.

### Ativação do Assistente

1. Aplicar `supabase/migrations/0079_commerce_assistant.sql`. A migration cria tabelas com RLS e sem acesso direto por `anon`/`authenticated`, além do bucket **privado** `commerce-assistant-documents` quando executada no Supabase. Não criar policy pública para esse bucket.
2. Usar as variáveis já existentes `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `APP_ENCRYPTION_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, somente no servidor. `OPENROUTER_ASSISTANT_MODELS` é a lista opcional, separada por vírgulas, de modelos permitidos ao superadmin. Sem ela, o assistente permite GPT-4.1 Mini e Gemini 3.1 Flash Lite, independentemente do modelo de texto utilizado pelo assistente criativo. Uma lista explícita precisa conter os dois para habilitar o fallback. Não trocar a chave de criptografia sem migrar os dados anteriores.
3. Em **Superadmin → Assistentes das lojas**, liberar o tenant e definir limites. Cada tentativa ao provedor reserva conservadoramente US$ 0,10 e o envelope máximo de tokens, conciliados com o uso informado pelo provedor. Falhas ou cobrança desconhecida mantêm a reserva. Um turno pode ter até três etapas e quatro tentativas, incluindo um fallback; laboratório até duas etapas e três tentativas. Custos adicionais da conta/provedor podem não estar nesse contador: usar também limites financeiros no OpenRouter. Não é um teto universal de faturamento.
4. Em **Loja online → Assistente IA**, cadastrar atendimento, FAQ e ficha oficial. PDFs: até **2 MB, 20 páginas**, no máximo 20 ativos. Padrão: baixar somente após identificação por e-mail. Disponibilizar apenas informações empresariais realmente autorizadas; não anexar extratos, dados de terceiros ou credenciais. O modelo não recebe os PDFs.
5. Salvar, testar a conexão e usar **Laboratório** para perguntas sem criar carrinho ou comprador; ele usa o catálogo publicado. O preview comercial de compra não executa atendimento real. Depois revisar e confirmar a ativação na loja publicada. Testes do painel consomem chamadas reais; testes automatizados locais usam mocks.
6. Conferir **Schedules → commerce-assistant-cleanup** na Vercel após o deploy. Função privada `api/schedules/commerce-assistant-cleanup`, horária, sem URL pública/segredo novo. Preview fica inativo por padrão. Não duplicar a rotina como Cron público. O lote remove até 2.000 conversas vencidas por execução, além da limpeza oportunista ao iniciar/consultar atendimentos; acesso vencido é bloqueado independentemente do schedule. Backups seguem retenção da infraestrutura.

### Limites e Privacidade

O atendimento é identificado como IA e só começa após confirmação do visitante. Usa seleção de provedor com `data_collection=deny`, `zdr=true` e teto de preço por milhão de tokens (entrada US$ 2 / saída US$ 8, sem taxa fixa por chamada). Se não houver rota compatível, falha com orientação para a equipe, sem relaxar as restrições. Obrigações legais/exceções do provedor continuam aplicáveis; não prometer retenção absolutamente nula. Referências: [ferramentas](https://openrouter.ai/docs/guides/features/tool-calling), [seleção de provedores](https://openrouter.ai/docs/guides/routing/provider-selection), [retenção zero](https://openrouter.ai/docs/guides/features/zdr).

**Conferência obrigatória na conta OpenRouter:** a exclusão de Safety Retention deve ser definida como **ZDR only** nas configurações de privacidade da conta ou em guardrail vinculado à chave, para Google e demais modelos. `allow_safety_retention_google` e `allow_safety_retention_other` são campos documentados da API de Guardrails e não são enviados no corpo de inferência. `zdr=true` segue a escolha da conta/guardrail. Isso pode tornar modelos indisponíveis, inclusive o fallback. Não afrouxar a política para contornar falhas. [Política e configuração oficial](https://openrouter.ai/docs/guides/features/zdr).

Histórico não é salvo em localStorage. CPF/CNPJ, e-mails e alguns padrões de telefone/credenciais são ocultados antes de persistir/enviar ao modelo; isso não reconhece todo dado pessoal. Mensagens e propostas usam a criptografia já existente da plataforma. Logs registram IDs técnicos, duração, status e uso, não transcrições nem corpo de resposta do provedor. Documentos passam pelo backend autorizado, nunca por URL pública de Storage. A página `/loja/<tenant>/assistente-privacidade` explica o fluxo ao cliente. Encaminhar para equipe registra a solicitação; não promete humano online ou resposta imediata.

### GPT Padrão e Gemini Como Fallback

- [x] GPT-4.1 Mini como padrão de novas políticas; Gemini 3.1 Flash Lite como fallback autorizado pela lista global. Políticas explicitamente escolhidas pelo superadmin não são sobrescritas.
- [x] Uma tentativa adicional somente em falhas de conexão/timeout, indisponibilidade de rota (404), timeout HTTP (408), limite do provedor (429) ou HTTP 5xx. Não trocar por erro de credencial, saldo, validação, cancelamento do cliente ou erro de gravação no banco.
- [x] Reserva atômica por tentativa, mesma política de privacidade/preços em ambos e logs técnicos com modelo utilizado. Depois da troca, continuar no Gemini até o fim da resposta, sem tentar novamente o GPT a cada ferramenta. Próxima mensagem volta a tentar o modelo principal.
- [x] Compatibilidade Gemini: raciocínio mínimo, sem `parallel_tool_calls` não suportado nos endpoints consultados, e assinaturas/metadados preservados apenas durante a execução no servidor. Resultados anteriores do GPT são passados como referências de dados, não como chamadas Gemini sem assinatura. Nenhuma ferramenta é executada pelo mecanismo de fallback, nem repetida automaticamente; inclusão de itens e orçamento continuam exigindo confirmação.
- [x] Validação: regressão geral com 962 testes aprovados, mais execução focada final de 23 testes de protocolo/política/continuidade e sete testes PostgreSQL de isolamento/cotas. Lint, tipos e build aprovados com limite de memória. Provedores simulados, sem cobrança real.
- [ ] Homologar com credenciais reais após deploy. Os testes locais usam provedores simulados e não geram cobrança.

Não há nova migration. Se a variável já estiver definida apenas com GPT, atualizar tanto no ambiente local quanto na Vercel e fazer novo deploy:

```dotenv
OPENROUTER_ASSISTANT_MODELS="openai/gpt-4.1-mini,google/gemini-3.1-flash-lite"
```

O fallback não é uma garantia de disponibilidade: se não houver provedor Gemini compatível com as restrições de privacidade, se a cota local acabar ou se ambas as tentativas falharem, o atendimento informa a indisponibilidade e oferece a equipe. Timeout de oito segundos por tentativa, sem retry infinito. A reserva de custo de uma tentativa malsucedida permanece quando a cobrança é desconhecida.

Referências: [parâmetros dos endpoints Gemini no OpenRouter](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints), [continuidade de raciocínio e ferramentas](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [assinaturas de ferramentas Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures). O mecanismo é controlado pela aplicação, não o fallback irrestrito de qualquer erro do roteador.

### Diagnóstico de Falhas na Ativação

- [x] Corrigir descarte do corpo de erro do OpenRouter: leitura limitada a 32 KB e classificação por HTTP/código, sem persistir nem registrar mensagens brutas, prompts, credenciais ou metadados arbitrários.
- [x] Distinguir autenticação, permissão, saldo, limite, prazo, rede e filtros de rota/privacidade/preço/parâmetros. O painel administrativo recebe orientação e referência; visitantes continuam recebendo mensagem genérica.
- [x] Registrar as tentativas GPT/Gemini e respectivos status no mesmo log final `Commerce operation failed.`, com `providerReference`, `providerDiagnostics` e `providerAttempts`. Não interpretar HTTP 200 com código de erro como sucesso.
- [x] Não marcar conexão como testada/ativada após falha; manter autorização, origem, revisão e limites. Não tentar outro modelo para contornar recusa de saldo/autorização em envelope HTTP temporário.
- [x] Regressão: 976 testes aprovados, 74 testes de integração condicionais não executados; conferência final de 12 testes de rota/página. Lint e tipos aprovados. Provedor simulado, sem consumo real de IA.
- [x] Build de produção aprovado com uma CPU e heap limitado; sem nova migration.
- [ ] Após deploy, repetir **Loja online → Assistente IA → Testar conexão** e conferir o diagnóstico real. O log 503 antigo, isoladamente, não identifica a causa upstream. Nenhuma chamada real ao OpenRouter foi feita na investigação local.

Sem nova migration ou variável obrigatória. Conferir a configuração de privacidade da conta antes de homologar; não enviar chaves pelo chat. Para investigação, usar o log final correlacionado e a referência exibida no painel, não o corpo bruto de conversas/respostas.

### HTTP 400 no Teste OpenRouter

- [x] Confrontar a requisição com o esquema público oficial `ProviderPreferences`: o objeto não admite campos adicionais, e os limites `max_price` são strings decimais. Os logs antigos demonstram HTTP 400 upstream, mas não incluem a mensagem de validação para confirmar qual campo provocou a recusa.
- [x] Retirar os dois campos de Guardrails do corpo de inferência e serializar os mesmos tetos como `prompt: "2"`, `completion: "8"`, `request: "0"`. Preservados `require_parameters`, `data_collection: "deny"`, `zdr: true`, cotas e limites financeiros.
- [x] TDD: teste de contrato falhou com o payload antigo, identificando os campos excedentes e os tipos numéricos. O contrato exato também é aplicado ao fallback.
- [x] Após a correção: 31 testes focados aprovados, incluindo contrato, fallback, diagnóstico seguro e autorização da rota administrativa. Lint e tipos aprovados, sem chamadas reais ao OpenRouter.
- [x] Build de produção aprovado após a correção, com uma CPU e memória limitada. Sem nova migration ou variável obrigatória.
- [ ] Aplicar deploy, conferir a política **ZDR only** na conta/guardrail e repetir o teste administrativo com o provedor real. Não atribuir o erro a credencial ou saldo sem evidência, nem afrouxar políticas para obter sucesso.

Referências: [esquema OpenAPI oficial](https://openrouter.ai/openapi.json), [roteamento de provedores](https://openrouter.ai/docs/guides/routing/provider-selection), [privacidade e Guardrails](https://openrouter.ai/docs/guides/features/zdr). Sem nova migration.

### Textos Públicos do Assistente

- [x] Remover referências a fornecedores e configurações técnicas da abertura do chat e da página pública vinculada de privacidade, mantendo identificação como IA, prazo do histórico, consentimento e cuidados com dados.
- [x] Simplificar a mensagem de falha para visitantes e orientar o assistente a não expor fornecedores/modelos/infraestrutura. Diagnóstico técnico permanece no painel administrativo e nos logs.
- [x] 47 testes focados aprovados, lint e tipos aprovados. Playwright conferiu ausência de termos técnicos na abertura, fluxo de proposta/orçamento e painel administrativo; loja em claro/escuro, 1440/390/320 px e paisagem. Capturas da abertura desktop/mobile inspecionadas, sem sobreposição. APIs simuladas, sem chamadas reais de IA.

Sem migration ou alteração de credenciais.

### Apresentação do Frete ao Cliente

- [x] Retirar valor declarado e menções ao seguro das opções de frete, do PDF de orçamento da loja e do cartão de frete do assistente. Manter serviços, preços, totais e prazos de produção/transporte.
- [x] Orientar o assistente a não detalhar seguro nas respostas, sem mudar as cotações, o armazenamento ou os controles administrativos de seguro.
- [x] 31 testes focados aprovados: PDF, apresentação, totais/prazos e valor segurado preservado na chamada à transportadora. Lint e tipos aprovados. Playwright conferiu cartões de entrega e frete no chat sem seguro/valor declarado, nos dois temas, desktop/mobile/paisagem; capturas inspecionadas. APIs simuladas, sem cotação real ou cobrança.

Sem migration. A cobertura e o cálculo do seguro permanecem ativos; somente a apresentação ao cliente foi simplificada.

### Seleção de Produtos e Continuidade do Chat

- [x] Produto clicável no catálogo apresentado pelo assistente, com ação "Quero este produto" que envia o nome exato como mensagem; não adiciona itens nem altera o carrinho. "Conhecer produto" continua independente.
- [x] Retomar automaticamente o atendimento ativo pelo cookie da sessão, incluindo histórico e propostas já confirmadas. Consentimento aparece quando não existe atendimento ativo, foi apagado, encerrado ou expirou; não é repetido a cada abertura.
- [x] Restauração no servidor sem histórico/identificadores em localStorage, sem chamada de IA e sem criar nova sessão/conversa. Escopo por loja, sessão válida e conta; falha de rede oferece nova tentativa, sem simular consentimento.
- [x] 20 testes focados de UI/contrato/autorização aprovados e oito testes PostgreSQL em banco local isolado: sessões/contas distintas, expiração, encerramento, validade preservada e confirmação única. Sem acesso ao Supabase ou chamadas reais de IA.
- [x] Regressão geral: 989 testes aprovados, 75 integrações condicionais não executadas nessa rodada. Mais 20 testes focados finais após o ajuste de rolagem. Tipos e lint aprovados.
- [x] Playwright: escolha do produto envia uma única mensagem, sem alterar carrinho; visita à página, reabertura e histórico retomado sem novo consentimento; propostas confirmadas permanecem bloqueadas. Temas claro/escuro em 1440/390/320 px e paisagem, imagens carregadas, sem overflow. Capturas desktop/mobile inspecionadas. APIs simuladas, sem cobrança.
- [x] Build de produção aprovado com uma CPU e heap limitado. Banco temporário encerrado após os testes; nenhuma alteração em produção.

Sem nova migration. Conversas antigas ainda ativas também podem ser retomadas após o deploy.

### Orçamento Guiado sem Duplicar Produtos

- [x] Tratar `prepare_quote` como quantidades finais por produto, preservando os não mencionados e os IDs/arquivos de artes existentes. Repetir itens confirmados não os adiciona novamente; propostas sem alteração retornam o rascunho, sem nova confirmação.
- [x] Informar à IA o estado atual confirmado, separado das propostas pendentes. Grupos de artes ambíguos e exclusões seguem pela edição explícita, sem descarte automático de arquivos.
- [x] Após confirmar, gravar uma única mensagem com o rascunho e três caminhos: adicionar produto, alterar itens ou continuar para orçamento completo. Explicar validação por e-mail e dados pessoais/empresariais no formulário, nunca no chat.
- [x] Versionar propostas no payload criptografado para bloquear confirmações pendentes do fluxo anterior. Propostas já aplicadas continuam idempotentes; não regravar nem corrigir silenciosamente carrinhos antigos.
- [x] 23 testes focados aprovados e nove testes PostgreSQL isolados: cenário exato 50 + 20, preços/totais, preservação de IDs e artes, no-op sem proposta extra, confirmação repetida sem mensagem duplicada e bloqueio de proposta pendente antiga. Banco temporário encerrado após execução; nenhuma chamada real de IA.
- [x] Regressão geral com 998 testes aprovados e 76 integrações condicionais não executadas nessa rodada. Os nove testes PostgreSQL do assistente foram executados separadamente. Lint e tipos aprovados.
- [x] Playwright validou confirmação, caminhos de adicionar/alterar/continuar, formulário real de orçamento e retomada sem repetir confirmação. Claro/escuro, 1440/390/320 px e paisagem; capturas do card guiado inspecionadas, sem overflow. APIs simuladas, sem custo real de IA, e-mail ou pagamento.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Sem migration ou variável nova. Após deploy, propostas antigas ainda pendentes precisam ser recalculadas. Itens duplicados antes da correção devem ser revisados em "Alterar itens do orçamento"; não apagar automaticamente grupos que podem ter artes diferentes.

### Respostas Curtas e Continuação Real do Orçamento

- [x] Tom de WhatsApp: uma ou duas frases, uma pergunta por vez, sem repetir explicações dos cartões. Respostas de texto limitadas a três frases completas e 420 caracteres; preços, itens e documentos estruturados não são cortados.
- [x] Pedidos claros de seguir com o orçamento mostram um atalho oficial, sem chamada adicional de IA e sem confirmar/alterar itens. Negação ou pedidos com alterações continuam na conversa normal.
- [x] Ferramenta de navegação somente de leitura e link gerado pela loja para `orcamento?etapa=dados`, respeitando tenant/domínio, validação de e-mail e formulário existente. A IA não escreve URLs.
- [x] Bloquear placeholders de links e recuperar o atalho também em mensagens antigas, sem modificar o histórico salvo nem cortar mensagens do cliente.
- [x] Regressão geral: 1.005 testes aprovados, 76 integrações condicionais não executadas nessa rodada; nove testes PostgreSQL executados separadamente. Cobertos pedidos claros, negação, novas inclusões, permissão de orçamento, cap de texto, placeholders e rotas por tenant/domínio. Lint e tipos aprovados.
- [x] Playwright: botão com href real abre a página da etapa de dados com StoreCheckout; modal de orçamento e retomada do chat também conferidos. Claro/escuro, 1440/390/320 px e paisagem, sem overflow; capturas do atalho e rascunho inspecionadas. APIs simuladas, sem chamadas reais de IA ou envio de e-mail.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Sem migration ou variável nova. APIs externas simuladas durante a validação local.

### Assistente Conhece a Jornada da Loja

- [x] Orientações curtas sobre criação no estúdio, envio, retoque, enquadramento, guia SVG, segurança/sangria/corte e aprovação, sem prometer geração automática de imagens pelo chat.
- [x] Consulta de funcionalidades realmente disponíveis por tenant e catálogo: estúdio com modelo, biblioteca/campanhas, preparação pela equipe, entrega, retirada e consultas particulares.
- [x] Desconto por arte preparada e aprovada vem das configurações de cada produto; mostra percentual e teto por arte/grupo, sem assumir 10% universal nem conceder benefício só pelo upload.
- [x] Orçamento em PDF sem compromisso de compra, pagamento ou arte pronta; identificação por e-mail, dados e retomada na conta explicados com atalhos reais.
- [x] Guia compacto com detalhes recolhidos e links para estúdio, artes prontas, produtos e orçamento, respeitando prefixo do tenant ou domínio próprio.
- [x] Testes TDD de elegibilidade e recursos por tenant, ferramentas de consulta e UI. Regressão geral: 1.018 testes aprovados, 76 integrações condicionais não executadas nesta rodada; 35 testes focados aprovados na revisão final, incluindo o atalho do estúdio em domínio próprio. Lint aprovado; sem chamadas reais de IA.
- [x] Tipos aprovados. Playwright validou guias, limites, links e fluxo de orçamento em claro/escuro, 1440/390/320 px e paisagem, além da administração; capturas inspecionadas. APIs simuladas, sem chamadas reais de IA, e-mail ou pagamentos.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Sem migration ou variável nova. Nenhum desconto ou configuração de produto alterado automaticamente.

### Chat em Balões de Conversa

- [x] Balões diferentes para cliente e assistente, com nome, ícone, fundo contrastante e divisórias entre mensagens. Cartões oficiais continuam fora do balão de texto, agrupados com a resposta.
- [x] Cabeçalho, campo de mensagem e envio com estados de foco/hover; copiar resposta com confirmação acessível e tratamento de falha.
- [x] Entrada discreta de novas mensagens e indicador de consulta; histórico retomado sem repetir animações ou saudação. Preferência de movimento reduzido respeitada também na rolagem.
- [x] Testes TDD de identificação, agrupamento de ações, cópia/sucesso/falha, conteúdo literal e histórico sem reanimação. Regressão geral: 1.025 testes aprovados; 76 integrações condicionais não executadas nesta rodada.
- [x] Lint e tipos aprovados. Playwright verificou identificação, cópia, ações fora dos balões, contraste WCAG AA de pelo menos 4,5:1, campo integrado e ausência de overflow em claro/escuro e 1440/390/320 px/paisagem. Capturas inspecionadas; movimento reduzido e fluxo completo de orçamento também verificados, com APIs simuladas.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Sem migration ou variável nova. Alteração visual, sem mudanças na autenticação, nos preços ou nas ações do assistente.

### Jornada de Orçamento Simplificada

- [x] Produtos com miniaturas e grupos de artes recolhidos; quantidades editáveis no próprio orçamento, mantendo IDs e artes. Atualização e validação de valores pelo servidor.
- [x] Busca de produtos em modal, filtro por categoria e escolha de quantidades/grupos, sem sair do contexto de orçamento; remoção com desfazer protegido contra alterações posteriores.
- [x] Resumo lateral no desktop e barra inferior expansível no celular, com indicação de frete não incluído/a calcular e benefício por arte pronta separado do total.
- [x] Dados válidos recuperados resumidos, edição recolhível, entrega/retirada/sem frete explícitos e revisão antes de salvar. Formulários e validações fiscais mantidos.
- [x] Orçamento salvo com validade real, itens destacados, contatos recolhíveis e PDF prioritário; editar cópia e continuar compra usam confirmação segura antes de substituir itens, sem alterar o documento original ou iniciar pagamento.
- [x] Regressão geral com 1.037 testes aprovados e 76 integrações condicionais não executadas nesta rodada; 20 testes focados finais. Cobertos limites, IDs/artes, desfazer, recálculo, frete, destinatário sem frete, cópia sem alteração do original e confirmação de substituição. Lint e tipos aprovados.
- [x] Playwright com componentes reais e APIs simuladas: edição/remoção/desfazer, busca e inclusão por grupos, upload acessível no próprio orçamento, dados recuperados, frete mais rápido, revisão/salvamento e cópia. Claro/escuro em 1440/390/320 px e paisagem, sem overflow; moedas longas e dock do assistente verificados. Capturas inspecionadas; nenhum e-mail, pagamento ou serviço externo real acionado.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Reutiliza APIs e persistência existentes. Nenhuma migration ou variável nova necessária.

### Meus Orçamentos em Cartões

- [x] Cartão independente para cada proposta, com código, total, composição do frete, datas e validade real. Destaques de hover/foco e movimento reduzido respeitado.
- [x] Abertura pelo cartão e PDF independente, mantendo links privados autenticados por cliente/tenant; nenhuma ação de alteração ou pagamento adicionada à listagem.
- [x] Busca por código/data, filtro de validade e ordenação por data/valor, sem alterar a lista original. Contagem dos resultados disponíveis, sem apresentar o limite de 100 como total histórico da conta.
- [x] Carregamento, conta vazia, busca sem resultados e falha de rede distintos; recuperação com “Tentar novamente”. Validade atualizada ao retomar a janela e a cada minuto, sem novas consultas à API.
- [x] Dez testes focados aprovados, incluindo ordenação, filtros, links privados, conta vazia e recuperação de falhas sem operações de escrita.
- [x] Playwright com componentes reais e APIs simuladas em claro/escuro, 1440/390/320 px e paisagem: filtros, navegação pelo cartão, PDF independente, valores longos, falha/repetição e conta vazia. Capturas inspecionadas, sem overflow.
- [x] Regressão geral com 1.042 testes aprovados e 76 integrações condicionais não executadas nesta rodada. Lint e tipos aprovados; teclado e movimento reduzido também conferidos no navegador.
- [x] Build de produção aprovado com uma CPU e memória limitada. Nenhuma alteração em produção.

Reutiliza APIs e persistência existentes. Nenhuma migration ou variável nova necessária; nenhuma alteração em produção.

### Meus Orçamentos em Lista Vertical e Exclusão Individual

- [x] Um orçamento por linha, em toda a largura, com disposição horizontal compacta no desktop e reorganização responsiva no celular. Busca, filtros e PDF preservados.
- [x] Lixeira independente do clique de abertura, com tooltip, confirmação identificando o orçamento/valor e mensagem clara sobre a irreversibilidade. Falhas aparecem dentro do modal; bloqueio contra cliques duplicados.
- [x] Exclusão real do documento privado via `DELETE`, exigindo origem autorizada, confirmação explícita e sessão de comprador. Tenant/cliente derivados do servidor e filtrados na mesma instrução SQL; IDs malformados e orçamentos de outra conta não são acessíveis.
- [x] Excluir o orçamento não exclui pedidos, artes ou carrinho. A linha sai somente após sucesso confirmado; contagem, filtros e estado vazio permanecem coerentes, com confirmação acessível e retorno de foco.
- [x] 18 testes focados aprovados: confirmação/cancelamento, falha sem perda de itens, bloqueio de repetição, ownership, validação do body, autenticação e proteção de origem.
- [x] Revisão visual em claro/escuro, 1440/390/320 px e paisagem: um item por linha, PDF/lixeira independentes, modal compacto, cancelar, falhar, tentar novamente, excluir e recarregar sem o item. APIs simuladas, capturas inspecionadas e ausência de overflow verificada.
- [x] Regressão geral com 1.050 testes aprovados e 76 integrações condicionais não executadas nesta rodada. Lint, tipos e build de produção aprovados com uma CPU e memória limitada; nenhuma alteração em produção.

Sem migration ou variável nova. A exclusão afeta somente orçamentos particulares do cliente na loja, não o cadastro administrativo de orçamentos.

### Transformação Contínua na Demonstração do Estúdio

- [x] Substituir o fade da interface inteira por uma mistura sobreposta de 650 ms entre a arte anterior e a próxima, nas duas faces. Controles, texto e produto permanecem visíveis, sem esmaecer em direção ao fundo.
- [x] Manter o quadro anterior durante o preparo e misturar somente os canvases já renderizados. Alpha complementar preserva a opacidade do produto; a geometria é calculada uma única vez por etapa, não a cada frame. A mistura é apenas visual e não modifica o arquivo final usado na compra.
- [x] A contagem da próxima etapa começa após a conclusão das duas faces. Editar, pular ou sair cancela os frames pendentes; movimento reduzido apresenta o resultado diretamente. Fora da demonstração, as prévias mantêm atualização imediata.
- [x] 27 testes focados aprovados: mistura com alpha complementar, conclusão/cancelamento sem frames antigos, tamanho de canvas, movimento reduzido, sequência, espera das duas faces, interrupção, foco e falhas.
- [x] Playwright em claro/escuro e 1440/390/320 px: pixels intermediários distintos nas duas faces, centro do produto opaco em todos os frames amostrados e opacidade da interface constante em 100%. Pular/interromper e movimento reduzido conferidos, sem overflow; capturas inspecionadas. Sem chamadas a APIs, IA ou gravação de arte.
- [x] Regressão geral com 1.058 testes aprovados e 76 integrações condicionais não executadas nesta rodada. Lint, tipos e build de produção aprovados com uma CPU e memória limitada; nenhuma alteração em produção.

Nenhuma migration ou variável nova necessária.

### Área do Cliente, Compras e Sessão

- [x] “Meus pedidos” em linhas compactas, com total, data, itens/unidades e estados separados de pagamento e andamento. Busca por código/produto/data, filtro de pagamento e ordenação, sem modificar os pedidos.
- [x] “Seu pedido” com total no cabeçalho, etapas baseadas no estado real, itens com miniaturas do catálogo quando disponíveis, entrega/prazos registrados e resumo financeiro. Dados completos recolhidos; artes e condições aceitas preservadas nos endpoints privados existentes.
- [x] Pagamento Mercado Pago continua no componente oficial existente e apenas para pedidos pendentes; os demais casos mostram confirmação, estorno ou instruções manuais. Pedidos de teste não apresentam uma promessa de produção/envio real.
- [x] Menu de conta com orçamentos, compras, perfil e logout, acionável por clique/toque e teclado. Fecha ao selecionar, clicar fora ou usar Escape, com retorno de foco; posição respeita telas pequenas e domínio próprio.
- [x] Carregamento, falha de sessão e visitante confirmado são estados distintos. O formulário de acesso só aparece após resposta de visitante, sem flash durante a recuperação. Respostas antigas são descartadas na troca de tenant/cliente; dados de identidade não são salvos em localStorage. Logout retira o conteúdo privado após sucesso do servidor, antes de carregar o estado visitante.
- [x] Playwright com o Storefront real e APIs simuladas em claro/escuro, 1440/390/320 px e paisagem: lista/filtros, detalhe, artes recolhidas, dropdown, domínio próprio, erro/repetição e logout. Observador de DOM confirmou ausência do formulário de login durante navegação autenticada; capturas inspecionadas e ausência de overflow verificada. Nenhum pagamento, envio de e-mail ou alteração de pedido real.
- [x] 38 testes focados aprovados: sessão pendente/visitante/falha, logout, troca de loja e respostas antigas, menu/foco, lista/filtros, detalhe, pagamento pendente/pago/teste/estorno e regressões de prévia, orçamento e pagamento existente.
- [x] Regressão geral: 1.072 testes aprovados e 76 ignorados em 194 arquivos aprovados (um worker, memória limitada).
- [x] Lint sem avisos, checagem de tipos e `git diff --check` aprovados.
- [x] Build de produção aprovado com memória limitada (`npm run build:local`, um CPU, heap de 1 GB).

Reutiliza autenticação, APIs e persistência existentes. Nenhuma migration ou variável nova necessária.

### URLs Amigáveis de Produtos

- [x] Slug persistido por produto publicado, sem acentos, com palavras separadas por hífen e unicidade por tenant. Nomes repetidos recebem `-2`, `-3`, etc.; produtos inativos continuam reservando suas URLs. Renomear/republicar não muda o slug já criado.
- [x] Links antigos por UUID redirecionam com HTTP 308 para o endereço canônico, preservando os parâmetros de artes, estúdio e campanhas. Prévia privada permanece autorizada e usa redirecionamento temporário; domínio próprio e caminho da plataforma respeitados.
- [x] Catálogo, menu, rodapé, estúdio, campanhas, orçamentos e assistente passam a usar os links amigáveis. UUIDs internos permanecem nas APIs, carrinho, artes, pedidos e pagamentos.
- [x] Sitemap geral e por loja, canonical, título/descrição por produto, Open Graph/Twitter e JSON-LD de produto/breadcrumbs alinhados à URL nova. Nenhuma avaliação ou disponibilidade de estoque inventada.
- [x] Migration `0080_commerce_product_slugs.sql` validada em PostgreSQL 16 local isolado: backfill, acentos (inclusive decompostos), nomes repetidos, isolamento por tenant, renomeação/republicação, URLs inativas, publicações concorrentes, restrições e reexecução. Seis testes de banco aprovados.
- [x] Regressão de links, rotas, SEO, navegação e prévia: 1.087 testes aprovados, 82 ignorados (incluindo os seis testes de banco, executados e aprovados separadamente). Novos testes cobrem URLs, parâmetros, 404, metadados, JSON-LD seguro, domínio próprio, prévia autorizada e carrinho/preços mantendo UUIDs.
- [x] Navegador com APIs simuladas: catálogo → produto por slug em 1440/390 px, claro/escuro e caminho da plataforma/domínio próprio; UUID confirmado nas chamadas de preço e capturas inspecionadas, sem overflow ou exceções. Regressão da área do cliente em 1440/390/320 px e paisagem também aprovada.
- [x] Lint e `git diff --check` aprovados.
- [x] Checagem de tipos aprovada.
- [x] Build de produção aprovado (`npm run build:local`, um CPU, heap de 1 GB).

Aplicar **`supabase/migrations/0080_commerce_product_slugs.sql` antes do deploy**. Preenche os produtos já cadastrados e gera URLs automaticamente nos próximos cadastros, sem precisar republicar a loja. Nenhuma variável de ambiente nova. Não altera os IDs, preços ou snapshots de pedidos anteriores.

Referências: [URLs descritivas no Google Search Central](https://developers.google.com/search/docs/crawling-indexing/url-structure) e [redirecionamentos permanentes](https://developers.google.com/search/docs/crawling-indexing/301-redirects). Essas melhorias não garantem posicionamento ou exibição de resultados enriquecidos.

### Descoberta e Preços por Quantidade

- [x] Resumo e tabela acessível no HTML inicial: referência de uma unidade, menor preço com sua quantidade, compra mínima total, preços/economia e atalhos de simulação. Valores das linhas gerados pelo mesmo carrinho, sem publicar curvas, taxas internas ou benefícios ainda não aprovados. Tabela recolhível, rolável localmente no celular; cartões do catálogo também exibem preço mínimo e condição.
- [x] Título/descrição, total mínimo comprável e JSON-LD alinhados. Uma única `UnitPriceSpecification` com preço total e `referenceQuantity`, sem dois preços ativos conflitantes. Links `?quantidade=N` apenas para exemplos publicados, mantendo canonical do produto e uma arte. Duplicidades/parâmetros inválidos usam o mínimo real. Não há `sale_price` ou `AggregateOffer` simulando desconto incondicional.
- [x] Perguntas sobre quantidade, divisão por arte, benefício aprovado, orçamento sem compra e produção/transporte geradas das configurações reais; sem promessa de rich results de FAQ. `Organization`/`WebSite` na home contêm somente identidade e contato públicos já cadastrados.
- [x] Catálogo XML em `/loja/{slug}/produtos.xml` ou `/produtos.xml` no domínio próprio. Somente loja publicada e produtos ativos com adesão explícita, identificação validada e imagem HTTPS; valor total mínimo, medida `Nct`/base `1ct`, URLs e moeda reais. Não cria compradores/sessões nem acessa pedidos, credenciais ou APIs de pagamento.
- [x] Em Loja e catálogo → produto → Catálogo Google, a seleção declara que o produto é novo e tem disponibilidade/capacidade confirmadas; informe GTIN válido ou marca/MPN, ou declare ausência real de identificadores. Desmarcar retira o item do próximo feed. Sem essa declaração não se publica disponibilidade nem se inventam códigos. Em Busca e catálogo, há URLs, copiar/abrir e etapas externas de ativação.
- [x] Robots da plataforma/domínio próprio compartilham todas as exclusões com `OAI-SearchBot`, incluindo orçamentos e APIs. Não altera a política existente para treinamento e não substitui autenticação. Domínio próprio continua bloqueando APIs de outro tenant.
- [x] Cache público LRU de até 256 projeções, chaveado pelo snapshot completo atual: preços/nomes/identificadores novos invalidam imediatamente. A consulta SQL continua verificando atividade; não há cache de sessões/compradores. Cópias isoladas evitam mutações de uma requisição contaminando outra.
- [x] Combinações que excedem o limite financeiro real do carrinho não entram no menor preço anunciado nem na tabela. O XML usa `no-store` e verifica publicação/atividade em cada leitura, para não reutilizar um catálogo desativado na CDN.
- [x] Preço unitário e total inicial também são renderizados no servidor para as quantidades publicadas (sem “Calculando…”). São apenas apresentação: adicionar ao carrinho continua exigindo a resposta de preço autorizada do servidor; falhas da API não liberam a compra.
- [x] TDD e regressão final: 1.121 testes aprovados e 82 integrações condicionais ignoradas. Inclui valores por quantidade comparados ao carrinho, taxas/limiares/curvas não monotônicas, limites financeiros, cache isolado, preço inicial real em SSR com compra bloqueada, metadados/medidas unitárias, XML/identificadores, opt-in, 404/erros e isolamento de tenant.
- [x] Navegador com APIs simuladas: loja em claro/escuro, plataforma/domínio próprio e 1440/390/320 px; tabela, simulação, perguntas e ausência de overflow. Administração de busca e opt-in verificados nos três tamanhos. Capturas inspecionadas; nenhuma chamada a Google, pagamento ou gravação real.
- [x] Lint sem avisos, checagem de tipos e `git diff --check` aprovados.
- [x] Build de produção aprovado com uma CPU e heap de 1 GB (`npm run build:local`). Nova rota pública XML incluída no build; nenhum deploy executado.

Ativação: publicar a loja, revisar os produtos e salvar suas declarações de catálogo. Em Busca e catálogo, copiar o sitemap para o Search Console e o XML para uma fonte agendada do Merchant Center. O titular precisa verificar a propriedade do domínio e configurar frete/devoluções/prazos nessas contas externas; esses serviços não são ativados automaticamente pelo código. Validar algumas páginas em Rich Results Test e Inspeção de URL, acompanhar indexação/conversões e permitir buscadores legítimos no firewall da Vercel. Não há garantia de posicionamento, anúncio ou citação por IA; nenhum anúncio pago é criado.

Nenhuma migration ou variável nova nesta etapa. `merchant` é opcional e persistido no snapshot JSON já existente. A migration `0080` da etapa anterior continua necessária para as URLs amigáveis.

Referências oficiais: [preços e unidades no Google](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing), [dados do catálogo](https://support.google.com/merchants/answer/7052112?hl=pt-BR), [identificadores reais](https://support.google.com/merchants/answer/160161?hl=en), [busca com IA do Google](https://developers.google.com/search/docs/appearance/ai-features), [buscadores da OpenAI](https://developers.openai.com/api/docs/bots). `llms.txt` não é requisito nem garantia de descoberta.

### Logo e Ícone da Loja

- [x] Separar logo institucional e ícone de navegador na configuração, com upload e prévias em 16, 32 e 48 px; remoção do ícone separado reutiliza o logo enviado.
- [x] Publicar favicon PNG quadrado (512 × 512) e manifest por loja; preservar a identidade da plataforma fora do domínio da loja. Prévia privada usa a imagem salva, sem manifest nem indexação.
- [x] Manter o logo completo em `Organization.logo`, sem substituí-lo pelo ícone simplificado.
- [x] Isolar assets por tenant e permitir apenas imagens próprias do bucket `commerce-media` no Supabase configurado, sem credenciais no download, redirecionamentos ou URLs arbitrárias; limites de bytes/pixels e respostas de erro sem cache.
- [x] TDD e suíte completa: 1.146 testes aprovados e 82 integrações condicionais ignoradas. Inclui upload/salvamento independente, PNG real, limites, URLs maliciosas/outros tenants, manifest, metadados e roteamento de domínio.
- [x] Navegador em 1440/390/320 px com APIs locais simuladas: prévias usando o logo fornecido, upload/remoção sem submeter o formulário, imagens carregadas e ausência de overflow/sobreposição. Capturas inspecionadas; nenhuma gravação real ou publicação de imagens.
- [x] Lint sem avisos, tipos, `git diff --check` e build de produção com uma CPU/heap de 1 GB aprovados.

Em **Loja online → Loja e catálogo → Identidade e atendimento → Logo e ícone da loja**, envie o logo completo e, opcionalmente, um ícone simplificado. PNG, JPEG ou WebP, até 3 MB. Recomendação: 512 × 512 px, boa legibilidade em 16 px. O arquivo enviado é normalizado sem recortar a marca; os originais locais não são alterados. Clique em **Salvar loja e catálogo** para aplicar.

O upload continua no bucket existente, como WebP; a rota pública `/loja/{slug}/icon.png` entrega PNG. No domínio próprio, `/icon.png`, `/favicon.ico` e `/site.webmanifest` são exclusivos da loja. O cache dura até cinco minutos; a URL nos metadados ganha uma nova versão ao trocar a imagem. Logos antigos de URLs externas não são baixados pelo servidor: envie o ícone por esse upload.

Sem migration, bucket ou variável nova: `faviconUrl` é opcional no JSON de configurações já existente. Reutiliza o Supabase Storage previamente configurado e o vínculo de domínio já autorizado. Não altera o favicon global da plataforma.

O Google usa um favicon por **hostname**, não por subdiretório: a loja com domínio próprio pode ter seu ícone na busca; lojas em `/loja/{slug}` compartilham o hostname da plataforma no Google, embora cada aba tenha seu ícone. Atualização depende de novo rastreamento e não há garantia de exibição. Referências: [favicon na busca](https://developers.google.com/search/docs/appearance/favicon-in-search) e [logo da organização](https://developers.google.com/search/docs/appearance/structured-data/organization).

### Métricas e Google Analytics 4

- [x] Aba **Métricas e GA4** com configuração por tenant, consentimento básico opcional, eventos das jornadas de compra/orçamento e exclusão de prévia/testes.
- [x] Painel interno com pagamentos confirmados/pendentes, orçamentos salvos, carrinhos e rascunhos com/sem login, possível abandono e evolução diária; sem fingir que são relatórios importados do Google.
- [x] 1.173 testes aprovados na regressão, cinco testes SQL executados em PostgreSQL descartável, navegador em três tamanhos, lint, tipos e build limitado aprovados.

Aplicar **`0081_commerce_analytics.sql` antes do deploy** e configurar o `G-…` na nova aba. Nenhuma variável de ambiente nova. [Instruções, eventos, critérios e limitações](ecommerce-analytics.md).
