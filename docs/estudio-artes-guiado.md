# Estúdio guiado de artes

Fluxo compartilhado pela produção administrativa, orçamento público e carrinho da
loja (incluindo a prévia privada): **Retocar (opcional) → Enquadrar → Aprovar**.

## Posição da imagem

- [x] Zoom junto da simulação frente/verso, antes das opções de fundo e geometria. O controle permanece disponível quando a simulação é recolhida e atualiza o produto em tempo real.

Reposicionamento do zoom validado por 18 testes focados, TypeScript, lint e navegador em 1440/390/320 px, com conferência dos pixels e atualização das duas prévias. Esta alteração de layout não exige nova migration.

O retoque e o enquadramento permitem deslocar a imagem horizontal e verticalmente,
inclusive no tamanho de 100%. Os controles de posição são independentes do zoom de
visualização; **Centralizar** zera apenas o deslocamento.

No retoque, o fundo ampliado ou continuado acompanha a imagem. Guias de produção e
elementos desenhados permanecem fixos. Para mover os desenhos junto com a imagem,
use **Incorporar** antes. O deslocamento integra o rascunho (quando disponível) e
a versão exportada, sem modificar o original. Rascunhos antigos continuam válidos.

Os mesmos controles estão disponíveis na produção interna, no orçamento público,
na loja e na prévia. Os controles de posição não exigem migration; o novo preenchimento
de fundo exige a migration indicada ao final deste documento.

## Planejado x realizado

- [x] Mesmo estúdio no viewport, com etapas visíveis e navegação entre ferramentas.
- [x] Retoque salvo segue para enquadramento da nova versão, sem retornar à listagem.
- [x] Original preservado pelos mecanismos de versões existentes; quantidade do lote mantida.
- [x] Retoques exportam uma nova tela de imagem: o enquadramento é reiniciado e exige revisão.
- [x] Mudanças pendentes: salvar, descartar ou continuar editando; falhas não fecham o editor.
- [x] Revisão da imagem final e confirmação explícita antes da aprovação.
- [x] Reenquadramento/retocar exige nova aprovação; permissões e bloqueios continuam nas APIs existentes.
- [x] APIs administrativas, públicas e da loja permanecem separadas; a prévia não cria pedidos reais.
- [x] Testes de regressão dos adaptadores e da navegação.
- [x] Compra simulada em navegador em 1365, 390 e 320 px: upload, retoque, enquadramento, aprovação e checkout; nenhuma compra real ou arte persistida pela prévia.
- [x] Validação visual desktop/mobile e build local com limite de memória.
- [x] Suíte completa: 251 testes aprovados; TypeScript, lint e build de produção aprovados.

Os seis testes de integração de banco da suíte não foram executados nesta etapa.
A simulação de navegador utilizou um banco local isolado e não acionou pagamentos
ou armazenamento de artes reais. Os adaptadores de orçamento administrativo e
público foram cobertos por testes de componentes com respostas de API simuladas.

## Completar fundo e bordas

- [x] Preenchimento reversível no enquadramento, atrás da imagem, até o corte.
- [x] Cor sólida, conta-gotas e remoção sem incorporar nem alterar o arquivo original.
- [x] Cor acompanha simulação, preparo, aprovação e arquivo usado no PDF de produção.
- [x] Retoque oferece completar bordas, continuar fundo e ajustar tamanho sem incorporação obrigatória.
- [x] Aviso de cobertura permite voltar diretamente ao preenchimento ou ao retoque.
- [x] Regressões de APIs/persistência e validação em navegador desktop/mobile.

Aplicar **0076_artwork_background_color.sql** antes do deploy desta melhoria. Não há novas variáveis de ambiente. A coluna opcional guarda a cor do enquadramento dos orçamentos internos e públicos; loja, provas e biblioteca usam seus campos JSON de enquadramento existentes. Artes antigas sem preenchimento continuam compatíveis. Transparência parcial é composta com a cor; branco opaco da imagem nunca é removido automaticamente.

Validação desta revisão: 784 testes unitários, 28 testes de integração em Postgres local vazio (incluindo round-trip interno/público da cor, remoção e preservação do original), lint/tipos e build de produção aprovados. O PDF A4 foi gerado a partir da arte com preenchimento. Playwright verificou captura de cor, pixels do fundo no retoque sem incorporar, remoção, reabertura e aprovação sem áreas descobertas em 320/390/1440 px. As ferramentas de retoque são recolhidas ao completar bordas, priorizando a cor no celular. O conta-gotas amostra apenas um pixel transformado, sem criar um canvas grande para produtos alongados; operações canceladas não sobrescrevem a cor escolhida depois. Nenhuma alteração, upload, cobrança ou chamada de IA foi feita em produção.
