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
6. Use **Solicitar orçamento** ou **Gerar orçamento sem comprar** no carrinho. Após login, informe faturamento e entrega; inclua frete se desejar. Nenhuma arte ou pagamento é obrigatório para o orçamento.
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
