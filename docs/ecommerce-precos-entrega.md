# Preços por quantidade e consulta de entrega

## Comportamento

- Produto e carrinho mostram preço unitário e total, comparados à referência de uma unidade. Os valores de referência só ficam riscados quando há economia real.
- A referência usa o canal e a curva publicados, incluindo as taxas. Não representa um preço anterior de promoção nem muda a quantidade mínima de compra.
- Diferentes artes podem ter preços unitários diferentes: nesse caso o produto mostra a faixa e uma seção recolhível com os valores por arte.
- Os cards da home, carrosséis e catálogo mostram “Até X% de desconto”, com a quantidade que permite esse desconto e a condição de uma arte para personalizados. Produtos sem desconto não recebem essa mensagem.
- O máximo é calculado dentro do intervalo publicado. O cálculo verifica cada quantidade inteira, inclusive pontos intermediários, mudanças de taxa e curvas não monotônicas; não expõe custos, comissões ou curvas internas na API pública.
- Consultar entrega no produto não adiciona itens nem altera o carrinho. Uma mudança de CEP, quantidade ou artes invalida o resultado anterior.

## Entrega nesta versão

O checkout do piloto utiliza a tarifa fixa configurada em Loja online e a retirada, quando habilitada. A consulta do produto usa essas mesmas opções e identifica explicitamente a tarifa da loja. CEP é validado por formato; esta consulta não verifica cobertura postal e não inventa prazos de transportadoras.

O valor definitivo continua sendo recalculado no servidor para o carrinho ao criar o pedido. A consulta do produto não é enviada como preço de frete ao checkout.

Cotação dinâmica por Melhor Envio/Correios na loja exige integrar a seleção e a validação da cotação também ao checkout; não foi introduzida nesta alteração.

## Endpoints

- `POST /api/store/[slug]/delivery`: loja publicada.
- `POST /api/commerce/[slug]/preview/delivery`: administrador autorizado, inclusive rascunhos.
- Corpo: `{ postalCode, lines }`, usando as mesmas linhas e quantidades do cálculo de preço, de um único produto.
- Resposta: `{ postalCode, estimated: true, options: [{ id, name, priceCents, description? }] }`.
- Validação de origem, limite de corpo, schema estrito, produtos restritos ao tenant e rate limit de 20 consultas/minuto por loja e endereço de acesso. Não cria cookie nem sessão de comprador.
- Logs registram tenant, contexto de prévia e número de opções, sem CEP ou informações pessoais.

## Planejado x realizado

- [x] Referência de uma unidade, unitário por quantidade e totais riscados.
- [x] Economia em reais e percentual; valores por arte quando diferentes.
- [x] Desconto máximo e quantidade nos cards.
- [x] Consulta de entrega no produto e no preview sem alterar o checkout.
- [x] Tratamento de falhas e descarte de respostas atrasadas.
- [x] Testes de cálculo, interface, isolamento por tenant, origem e rate limit.
- [x] Seis testes de integração com PostgreSQL isolado aprovados.
- [x] Navegador: 1365, 390 e 320 px, claro/escuro, sem overflow; fluxo até checkout simulado aprovado.
- [x] Suíte completa: 273 testes aprovados; seis testes de integração aprovados na execução separada acima.
- [x] TypeScript e lint sem erros ou avisos; testes da consulta repetidos após o ajuste final.
- [x] Build de produção aprovado com limite de memória.

Sem migration ou variável de ambiente nova.

## Correção da consulta no produto

- [x] Removida a dependência da consulta de entrega em relação ao resultado da API de preço. Uma falha de preço continua impedindo a compra, mas não a consulta da tarifa de entrega.
- [x] Validação de disponibilidade, limites de quantidade e grupos mantida no servidor, sem executar a curva de preços para consultar uma tarifa fixa.
- [x] Mensagem junto ao botão quando a seleção é inválida; mensagem específica para loja sem opções de entrega/retirada configuradas.
- [x] Testes reproduziram o bloqueio antes da correção e passaram após o ajuste.
- [x] Navegador: falha de preço simulada com consulta real à API local de entrega, sem liberar compra sem preço; fluxo normal até checkout simulado aprovado.
- [x] Suíte: 277 testes aprovados; seis testes de integração separados não executados nesta rodada. Lint sem avisos.
- [x] Build de produção e checagem de tipos aprovados.
