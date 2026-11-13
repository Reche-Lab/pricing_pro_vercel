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

A abertura dura aproximadamente 10 segundos, aguardando a renderização da composição entre etapas. Não usa IA, não faz upload, não grava arte, não aprova e não adiciona nada ao carrinho. O botão de continuar com a arte fica indisponível durante a demonstração; ao final, o cliente pode aproveitar o exemplo ou criar algo próprio. “Pular” restaura o ponto de partida e seleciona a mensagem para edição. Interagir diretamente preserva a composição que estava sendo mostrada e cancela os próximos passos automáticos. Com movimento reduzido, o convite para criar aparece diretamente, sem reprodução automática. A demonstração é carregada somente na abertura já existente do Estúdio e não exige migration ou variável de ambiente.

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
