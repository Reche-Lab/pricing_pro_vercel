# Condições de compra da loja

## Planejado e realizado

- [x] Página organizada com resumo, índice, assuntos separados, perguntas frequentes,
  contatos da loja e navegação para suas políticas.
- [x] Regras claras para vendedor, comprador, plataforma e prestadores, sem exclusão
  geral de responsabilidade, proibição automática de devolução de personalizados
  ou perda de garantia ao aprovar uma arte.
- [x] Conteúdo específico do tenant preservado, como complemento das condições gerais.
- [x] Página renderizada no servidor, metadados e dados estruturados específicos,
  prévia privada e URLs corretas no domínio próprio.
- [x] Impressão da página e opção de salvar como PDF pelo navegador.
- [x] Novos pedidos guardam texto completo, versão, data do aceite e revisão da loja
  no snapshot JSONB existente. Mudanças posteriores não substituem esse registro.
- [x] Download autenticado das condições de cada compra; pedidos antigos conservam
  somente o texto originalmente registrado, sem atribuição retroativa da nova versão.
- [x] Testes focados, TypeScript e lint; 14 testes em PostgreSQL local isolado,
  incluindo imutabilidade do texto e isolamento por tenant/comprador.
- [x] Regressão geral: 698 testes aprovados e 28 testes condicionais ignorados.
- [x] Build de produção e revisão visual do build real com PostgreSQL isolado em
  1440/390/320 px, temas claro/escuro, índice e botão de impressão sem overflow.
- [x] Impressão A4 conferida em PDF de cinco páginas, com texto legível e sem menus
  ou fundo escuro. Validação local concluída em 09/11/2026, sem pagamentos reais.
- [ ] Responsável pela loja conferir dados, prazos, atendimento e texto adicional;
  revisão jurídica antes da adoção definitiva.

## Onde editar

O texto em Loja online > Loja e catálogo > Condições de compra, produção, entrega
e privacidade continua editável. É apresentado como **Condições específicas desta
loja**, sem ser interpretado como HTML. Deve complementar a oferta sem afastar
direitos legais. Revise eventuais cláusulas antigas que contradigam essas regras.

As condições gerais ficam em `src/domain/commerce/purchase-conditions.ts`.
A revisão atual é `2026-11-09-v1`. Ao alterar o conteúdo geral, atualizar a versão
e a data editorial. A identificação fiscal da Ground Shop reaproveita o cadastro
institucional já existente; outros tenants não recebem esses dados. Para outras
lojas, a identificação legal completa precisa ser conferida pelo responsável.

## Registro e acesso

O aceite obrigatório do checkout é mantido. Na confirmação de um novo pedido,
`snapshot.terms` recebe o documento completo vigente; `termsVersion` e
`termsAcceptedAt` registram a versão geral e a data. O `storeRevision` existente
identifica a revisão da configuração da loja. Não é uma assinatura digital
certificada nem prova de que o comprador leu cada cláusula.

Em Meus pedidos > pedido, **Baixar condições aceitas** acessa
`GET /api/store/{slug}/orders/{orderId}/conditions`.
O endpoint exige sessão do comprador e filtra simultaneamente tenant, comprador
e pedido. A resposta é um anexo `.txt` UTF-8, com `private, no-store` e `nosniff`.
Nenhuma condição de outro cliente é revelada. O download é separado da listagem
para não repetir documentos longos em todas as respostas de pedidos.

Não há nova migration: são usados os campos JSONB e controles de acesso existentes.
O deploy atualiza a página; não é necessário apagar ou substituir o texto da loja.

## Referências e limites

Redação em linguagem simples, com base nos pontos pertinentes do
[Código de Defesa do Consumidor](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html),
do [Decreto do comércio eletrônico](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm)
e das orientações da [ANPD sobre direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares).
O texto não substitui análise jurídica da operação concreta. Não pressupõe que
um produto personalizado perde automaticamente os direitos de cancelamento ou
garantia. A loja deve conferir seus dados de identificação, cumprir a oferta e
manter canais de atendimento adequados; uma página de termos, sozinha, não prova
conformidade de todos os processos da operação.
