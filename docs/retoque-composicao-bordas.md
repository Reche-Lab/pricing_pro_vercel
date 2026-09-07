# Composição, recorte e continuidade de bordas

## Uso

1. Faça os retoques, adicione formas ou use **Expandir > Cópia ampliada**.
2. **Incorporar** reúne toda a composição visível em uma imagem. Uma nova cópia
   passa a incluir fundo, formas e pincel incorporados. O original não é substituído.
3. Para fundos lisos ou degradês simples, prefira **Expandir > Continuar bordas**.
   Ative o fundo, ajuste a expansão em milímetros ou use **Estender até o corte**.
4. **Recortar** incorpora a composição e aplica o contorno de corte cadastrado,
   deixando o exterior transparente. Não grava as linhas-guia na imagem.
5. **Salvar e enquadrar** mantém o fluxo de revisão e aprovação explícita.

**Desfazer incorporação** recupera os elementos do último estágio. Havendo novos
retoques ou ajustes, desfaça-os antes. **Restaurar original** remove todos os
estágios desta sessão/rascunho. As ações possuem instruções no atributo `title`.

## Limites

A continuidade usa a variação de cor no contorno visível, sem ampliar a arte
principal. Funciona também após recortes redondos e com margens transparentes
desiguais no arquivo. Vazios transparentes fechados dentro da arte são preservados.
O fundo completa a transição dos pixels semitransparentes da borda sem redesenhar
a frente opaca da imagem. Fundos brancos opacos continuam sendo parte da arte.

Degradês lineares são extrapolados; canais são limitados a 0–255. Texturas, objetos
e degradês complexos não têm reconstrução garantida: confira a prévia.
Incorpore primeiro os retoques que deverão influenciar as cores da borda.

**Estender até o corte** mede a distância entre o contorno visível e o molde,
incluindo diagonais, em vez de comparar apenas os tamanhos dos retângulos.

Somente o fundo sintetizado é amostrado em resolução reduzida para limitar o
processamento; a arte principal mantém sua resolução. A extensão é limitada à
área de trabalho visível e não altera o tamanho físico de produção do produto.
Não há geração por IA nem chamadas ao OpenRouter nesta ferramenta.

O rascunho JSON existente guarda os estágios como operações, não como imagens
base64 repetidas. São permitidos até 32 estágios; salve uma versão e reabra o
retoque para continuar depois desse limite. O renderer reutiliza a composição
anterior ao acrescentar estágios para evitar reprocessamento desnecessário.

## Planejado x realizado

- [x] Incorporar composição completa e duplicar o resultado novamente.
- [x] Desfazer incorporação e preservar a consulta ao original.
- [x] Recortar com a geometria das guias, incluindo formas não circulares.
- [x] Continuar bordas, controle em mm e extensão até o corte.
- [x] Instruções nos botões e mensagens de resultado.
- [x] Compatibilidade com rascunhos anteriores e validação no servidor.
- [x] Testes de degradê diagonal, transparência, limites e serialização dos estágios.
- [x] Navegador: comparação de pixels antes/depois de incorporar, duplicação,
  continuidade, recorte/desfazer, aprovação e checkout simulado, em desktop/mobile.
- [x] Suíte: 254 testes aprovados; seis testes de integração de banco separados não executados nesta etapa.
- [x] TypeScript, lint e build de produção aprovados, com limite de memória.

### Correção do contorno externo

- [x] Regressões para arte retangular com margem inferior transparente e expansão circular em 24 direções.
- [x] Preservação de furos internos, arte translúcida, pixels originais e tratamento de imagem vazia.
- [x] Distância euclidiana conferida contra pontos de referência e cálculo automático pelo molde.
- [x] Transição de antialiasing e ajuste local do degradê sem usar a transparência como cor de referência.
- [x] Navegador: fluxo de retoque, recorte e aprovação em 1365, 390 e 320 px, com banco isolado e conferência visual da expansão circular.
- [x] Suíte: 260 testes aprovados; seis testes de integração de banco não executados nesta rodada.
- [x] TypeScript e lint aprovados.
- [x] Build de produção aprovado com limite de memória.

Sem migration ou variável de ambiente nova. As permissões e os bloqueios de
orçamentos aprovados continuam nas APIs existentes.
