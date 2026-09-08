# Configuração da loja: interface

## Planejado x realizado

- [x] Isolar o ajuste visual na configuração do e-commerce, sem alterar formulários do precificador ou a loja pública.
- [x] Inputs e selects com altura de 44 px, independentes da altura do upload ou de campos vizinhos.
- [x] Rótulos alinhados, áreas de texto com redimensionamento vertical e conteúdo sem largura mínima forçada.
- [x] Separar identidade/atendimento de logo/capa; manter banners e produtos recolhíveis.
- [x] Seletor visual de tema com ícones e estado selecionado; amostra de cor com valor hexadecimal.
- [x] Tooltips para publicação, preços, tema, entrega e credenciais; abertura por mouse, foco ou toque e fechamento por Escape ou toque externo.
- [x] Foco visível, estados de hover/desabilitado e barra de salvar com fundo próprio.
- [x] TDD dos controles: ajuda sem submit, seleção de tema, bloqueio por fieldset e preservação dos dados no salvamento.
- [x] Regressão: 287 testes aprovados, seis testes de integração separados não executados nesta rodada. Lint, tipos e build de produção aprovados com limite de memória.
- [x] Conferência no navegador em 1365, 768, 390 e 320 px: campos com 44 px, tooltips dentro do viewport e sem overflow de texto nas abas. Nenhuma alteração persistida.

Sem migration, variável de ambiente nova ou alteração do contrato das APIs.
