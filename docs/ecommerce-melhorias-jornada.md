# Jornada de compra, artes e orçamentos

## Checklist planejado x realizado

- [x] Limite de artes compartilhado (unidades, limite do produto e teto de 10), sem descarte silencioso.
- [x] Rascunho privado de faturamento/entrega com expiração, sem guardar pagamento nem aceite.
- [x] Documento de entrega herdado do faturamento quando vazio e validado no servidor.
- [x] Frete destacado e pendências de arte com navegação até o item.
- [x] Regra de produção por tenant: max(mínimo de dias úteis, ceil(unidades / capacidade diária)).
- [x] Produção, transporte e data estimada separados na loja e nos fluxos administrativos.
- [x] Simulador sem borda brilhante e limite visível coincidente com a sangria.
- [x] Prévia frente/verso durante o enquadramento, com adaptação mobile.
- [x] Aviso de cobertura incompleta antes de aprovar, com atalho para retoque e registro da confirmação no servidor.
- [x] Guia SVG com instrução contextual.
- [x] Orçamentos privados do comprador: criação sem arte obrigatória, frete opcional, PDF e histórico.
- [x] Conversão de orçamento em carrinho sem criar pagamento/documento ERP automaticamente.
- [x] 767 testes unitários, 19 de integração em Postgres isolado, typecheck e lint aprovados.
- [x] Primeiro ciclo Playwright aprovado em 320, 390 e 1440 px, incluindo checagem de pixels dos dois simuladores.
- [x] Build de produção aprovado com heap de 1024 MB, um worker e cache webpack desabilitado no modo local reduzido.
- [x] Ciclo Playwright final aprovado sobre o build de produção, usando as máscaras reais de botton, checando pixels e limites do enquadramento em 320/390/1440 px.
- [x] Correção adicional de Grid/ResizeObserver: a prévia inteira cabe ao reduzir a tela para 320 px. O novo teste reproduziu o corte lateral antes da correção e passou depois.

## Regras

### Modo orçamento guiado e benefício condicional

- [x] Acesso “Solicitar orçamento” destacado no menu, com ícone e estado ativo.
- [x] Montagem sem login, faixa persistente com etapas, quantidade, subtotal e retorno ao resumo.
- [x] Catálogo e produto preservam a intenção de orçamento; inclusão e confirmação usam textos próprios.
- [x] Validação rápida por código no e-mail ao avançar para salvar; compradores já autenticados não repetem a validação.
- [x] Revisão explícita de produtos, dados e entrega antes de salvar. Voltar não descarta o preenchimento.
- [x] Histórico e PDF privados, com conversão explícita para compra e revalidação dos valores.
- [x] Benefício possível por arte pronta informa percentual, teto em reais por arte/produto e estimativa adicional, sem diminuir o total prematuramente.
- [x] Regras do benefício registradas no snapshot pelo servidor e incluídas na tela e no PDF. Orçamentos antigos continuam compatíveis.
- [x] Regressões completas, integração local e navegador desktop/mobile.

Somente a intenção de navegação é guardada em `localStorage`, isolada pela API do tenant. Produtos e quantidades continuam no carrinho da sessão; faturamento e endereço são criptografados no servidor após autenticação, sem dados pessoais no armazenamento local. Mudar de orçamento para compra conserva os itens existentes; recuperar outro orçamento continua exigindo confirmação de substituição. Um rascunho não é um orçamento salvo na conta.

O benefício utiliza as configurações existentes em **Loja online → Catálogo → Preparação da arte, benefício e modelo do produto**: o desconto é o menor entre o percentual do grupo e o teto em reais, uma vez por arte/produto. Artes já beneficiadas não geram nova promessa de desconto. A oferta é condicional ao envio, enquadramento e aprovação conforme o guia do produto, pronta para impressão, sem ajustes da equipe, e não incide no frete. A nova mensagem não altera o cálculo efetivo nem concede benefícios a arquivos sem aprovação válida.

Esta ampliação **não exige migration nem nova variável de ambiente**. O envio do código usa o SMTP já configurado na plataforma; os benefícios continuam sendo definidos por produto. Os snapshots JSON existentes recebem um campo opcional, sem modificar orçamentos anteriores.

Validação: 807 testes unitários, 19 testes de integração com PostgreSQL local novo, lint e build de produção (incluindo tipos) aprovados. O teste `scripts/commerce-quote-journey-browser.mjs` conferiu montagem anônima, persistência de intenção e itens ao recarregar, código inválido/válido, restauração do faturamento, revisão sem salvar prematuramente, retorno aos dados, frete no total, benefício condicional registrado, PDF autenticado, recusa de acesso anônimo e conversão explícita para compra em 1440/390/320 px. Somente a entrega do e-mail foi simulada: a verificação do código e a rotação do cookie passaram pelo servidor real local. O teste de menus confirmou também produtos, campanhas e artes, na loja pública e no preview, em claro/escuro e 1440/1920/390/320/844 px. A entrada de orçamento fica fora da área rolável das categorias e o resumo respeita a altura real do cabeçalho. Nenhuma cobrança, envio de e-mail real, alteração no Supabase ou chamada ao ERP foi realizada.

### Revisão: frete no orçamento

- [x] Calcular frete ativa sua inclusão no resumo e no orçamento enviado ao servidor.
- [x] Opções em cards compactos e responsivos, priorizando menor prazo; empates usam menor preço.
- [x] Seguro por volume mantém o total dos produtos, após benefícios, sem incluir o próprio frete.
- [x] Regressão de persistência/PDF, testes locais e conferência mobile.

Correção validada com 776 testes unitários, 19 testes de integração em banco local novo, typecheck, lint e build de produção com memória limitada. Playwright confirmou seleção automática do SEDEX mesmo com PAC mais barato, troca de serviço, inclusão no resumo, persistência após recarregar e download do PDF. Os cards foram conferidos em 320, 390 e 1440 px, em light/dark, sem overflow. As cotações do navegador são fixtures; não houve compra de frete ou chamada ao provedor real.

O seguro usa `insurance` em cada volume, conforme a [documentação de cálculo do Melhor Envio](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos). O rateio mantém exatamente o valor líquido dos produtos em centavos, sem somar o frete nem multiplicar o seguro pela quantidade de caixas. A cotação registra esse valor para exibição nos cards e no PDF; isso não equivale à compra de uma etiqueta.

Esta revisão não exige nova migration, somente publicação do código. Orçamentos já emitidos não são alterados retroativamente; gere um novo orçamento para incluir uma nova cotação.

Padrão: 3 dias úteis mínimos, 100 unidades por dia. 300 unidades = 3 dias; 301 = 4 dias. Soma-se a quantidade total a produzir. Estimativas antes da confirmação são condicionadas a pagamento e aprovação das artes. Datas usam America/Sao_Paulo, excluem sábados, domingos e datas sem produção configuradas; não presumem cadastro completo de feriados nacionais/locais. Transporte permanece uma estimativa do provedor.

Orçamento não é pedido nem reserva de preço/frete. A conversão exige nova conferência. Rascunhos pertencem ao tenant e à sessão autenticada; não são expostos em URLs públicas ou localStorage. Preview permanece isolado de pedidos, orçamentos e ERP reais.

## Banco e ativação

Migration: **0075_commerce_buyer_journey.sql**. Aplicar no Supabase correto **antes de publicar**. Todas as migrations, incluindo a 0075 final, foram aplicadas em um banco Postgres local vazio. Nenhuma migration, cobrança, emissão fiscal ou chamada de mutação ao ERP foi executada contra produção.

## Como utilizar

1. Em **Configurações → Geral → Prazo de produção**, ajuste dias mínimos, capacidade diária e datas sem produção. O padrão já atende 300 unidades em 3 dias e 301 em 4 dias úteis.
2. Em **Loja online → Entrega**, a entrega fixa pode ter seu prazo de transporte informado em dias úteis, separado da produção. O Melhor Envio fornece esse prazo nas cotações; quando não há prazo informado, mostramos **a confirmar**, sem inventar uma data de recebimento.
3. No produto, a seleção informa o limite de artes para a quantidade atual. Reduzir os grupos não apaga os arquivos; artes deixadas fora da seleção exigem confirmação antes de adicionar ao carrinho.
4. No enquadramento, o painel de produto em tempo real pode ser recolhido. A frente termina na sangria; o verso continua a faixa até o corte. A verificação de cobertura considera transparência/áreas descobertas, não um branco opaco intencional. Uma aprovação com áreas descobertas fica registrada para aquele enquadramento e é invalidada ao prepará-lo novamente.
5. No checkout, os dados são salvos automaticamente. Rascunhos ficam criptografados por até 14 dias, vinculados a tenant, sessão e comprador. Se a gravação falhar ou outra aba alterar os dados, o erro é informado. Aceite de termos, tokens de cartão e cotações de frete não são guardados no rascunho. Registros expirados ficam inacessíveis e são removidos na manutenção oportunista de rascunhos do tenant.
6. Use **Solicitar orçamento** ou **Gerar orçamento sem comprar** no carrinho. Monte os produtos sem login e avance para **Dados e entrega**; nesse momento, valide o e-mail se necessário. Confira os dados, inclua frete se desejar, revise e salve para acessar o PDF. Nenhuma arte ou pagamento é obrigatório para o orçamento.
7. Em **Minha conta → Meus orçamentos** (também pelo ícone de documento do cabeçalho), baixe o PDF e continue uma compra. O PDF mantém preços, benefício por arte e estimativas registrados. Ao recuperar o carrinho, revalidamos produtos/quantidades e pedimos nova conferência de preços/frete. Artes continuam vinculadas somente quando pertencem à sessão atual e não estão congeladas em outro pedido; em outra sessão, é necessário anexá-las novamente.

## Segurança e testes

- Orçamentos não possuem links públicos: listagem, detalhe e PDF exigem a sessão autenticada do comprador e o tenant correto.
- Tabelas privadas têm RLS habilitada e acesso SQL negado a `anon`/`authenticated`. Operações passam pelos handlers do servidor, com verificação de origem, limite de payload e rate limiting nas operações mais caras.
- Total, desconto por arte e frete são recalculados no servidor. A cotação é vinculada à revisão/hash do carrinho, sessão, CEP, revisão da loja e validade.
- A chave de idempotência possui hash do conteúdo; reutilizar uma chave com outros dados é recusado. Recuperar um orçamento substitui carrinho/rascunho em uma única transação e exige confirmação na interface.
- A validade inicial é de três dias, mas os orçamentos permanecem no histórico. Não equivalem a pedido, pagamento, reserva ou autorização de produção.
- Previews não criam orçamento ou pedido real. As ferramentas de arte da prévia continuam em memória.
- `scripts/commerce-buyer-journey-browser.mjs` exige banco e endereço locais; confere persistência, foco em pendência, PDF, limite de artes, dois canvases não vazios, confirmação de cobertura e ausência de overflow mobile.
- O build local usa um worker, heap de 1024 MB e não persiste o cache webpack quando `COMMERCE_LOW_MEMORY=true`. O disco local esgotou na primeira tentativa; somente `.next/cache` foi removido para recuperar espaço. Arquivos pessoais não foram removidos.
- Validação final: suíte completa de 767 testes unitários, 19 testes de integração em banco novo, regressões focadas de checkout/simulador, verificação de tipos/lint no build e navegador real. Nenhuma cobrança ou emissão fiscal real foi realizada.
