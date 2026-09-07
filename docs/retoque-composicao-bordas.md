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

A continuidade usa a variação de cor nas bordas, sem ampliar a arte principal.
Degradês lineares são extrapolados; canais são limitados a 0–255. Texturas, objetos,
transparências e degradês complexos não têm reconstrução garantida: confira a
prévia, principalmente nos cantos. Use a extensão antes do recorte e incorpore
primeiro os retoques que deverão influenciar as cores da borda.

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

Sem migration ou variável de ambiente nova. As permissões e os bloqueios de
orçamentos aprovados continuam nas APIs existentes.
