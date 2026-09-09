# Adicionar e remover produtos do orçamento

## Acesso

Em **Orçamentos > abrir orçamento > Itens > Editar**, use **Adicionar produto** ou o ícone de lixeira ao lado do item. A exclusão exige confirmação e informa que as artes vinculadas também serão removidas do orçamento.

O novo produto recebe o preço sugerido pela curva disponível no editor. Quantidade, produto, preço e nome da arte/lote podem ser ajustados antes de salvar. Preço diferente da curva exige motivo. Depois de salvar, o item pode receber imagens pelo editor existente.

## Planejado x realizado

- [x] Inclusão e remoção no modal existente, sem outra página.
- [x] Preço sugerido pela curva e possibilidade de negociação manual com motivo.
- [x] Preservação dos IDs dos itens mantidos; novos IDs gerados pelo banco.
- [x] Limite de 50 itens, pelo menos um produto e confirmação antes de remover.
- [x] Validação de IDs duplicados, pertencimento ao orçamento e produtos do tenant.
- [x] Conferência da lista original de IDs antes da sincronização externa e novamente dentro da transação local, para impedir remoções involuntárias por telas com listas desatualizadas.
- [x] Totais, descontos e parcelas recalculados; histórico com usuário, motivo, quantidades adicionadas/removidas e snapshots antes/depois.
- [x] Orçamento aceito permanece bloqueado até reabertura administrativa; orçamento com NF Olist não pode ser editado.
- [x] Reutilização do fluxo de atualização dos itens do pedido Olist. Erros externos impedem a alteração local. Restrição existente de alteração do desconto em pedidos já criados preservada.
- [x] Testes unitários de validação, interface e rota; testes reais em PostgreSQL local isolado; navegação Playwright em 1440, 390 e 320 px com persistência após reload.
- [x] Suíte geral: 310 testes aprovados e seis testes de integração do e-commerce não executados nesta rodada. Lint, verificação de tipos e build de produção aprovados com limite de memória.

## Pontos de atenção

- O valor de frete é mantido. Após mudar os produtos, revise a embalagem e calcule o frete novamente antes de comprar uma etiqueta; o editor apresenta esse aviso quando há valor de frete.
- A sincronização externa e a gravação no PostgreSQL não são uma transação distribuída. Uma indisponibilidade do banco após sucesso do Olist ainda exige conferência do pedido externo antes de tentar novamente, como no fluxo anterior.
- A exclusão remove os registros das artes associadas por cascade. Objetos já armazenados no storage e PDFs de produção previamente gerados não são apagados por este fluxo.
- Não foram realizadas operações reais no Olist durante os testes.

## Verificação local

`npm run test:local` executa os testes unitários. Para os testes de banco desta alteração, configure `QUOTE_EDIT_TEST_DATABASE_URL` apontando para PostgreSQL local (`127.0.0.1`, banco com prefixo `commerce_test_`) e execute `npm run test:local -- src/tests/integration/quote-item-edit-database.test.ts`.

`scripts/quote-items-browser.mjs` exercita a interface e a API com dados fictícios e limpa os registros ao terminar. Exige o mesmo banco isolado, `QUOTE_EDIT_TEST_BASE_URL`, Playwright e servidor local com `AUTH_SECRET=quote-local-test-secret-at-least-32-characters`. Não executar contra produção.

**Não há nova migration nem variável de ambiente de produção.**
