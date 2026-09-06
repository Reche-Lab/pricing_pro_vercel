# E-commerce: ponto de retomada

Registro em 05/09/2026, após interrupção das validações por travamento da máquina.
Esta implementação é um piloto em andamento, não uma entrega homologada para produção.

## Implementado no workspace

- [x] Módulo opcional por ambiente (`COMMERCE_ENABLED`, padrão `false`) e por tenant.
- [x] Migration `0062_optional_commerce.sql`, sem ativação automática de lojas.
- [x] Administração em `/commerce`: catálogo publicado, identidade da loja, pagamentos e pedidos.
- [x] Loja em `/loja/[slug]`: catálogo, busca, produto, carrinho persistente e checkout.
- [x] Cálculo no servidor por quantidade e grupos de artes, com snapshots no pedido.
- [x] Conta do comprador separada da conta administrativa, com código por e-mail.
- [x] Fluxo de upload, retoque, enquadramento e aprovação das artes.
- [x] Consulta de pedidos e acesso administrativo às artes e PDF de produção.
- [x] Pagamento manual e implementação de Checkout Pro com credenciais próprias do tenant.
- [x] Validação de assinatura de webhook e conferência de vendedor, pedido, moeda e valor.

## Verificações confirmadas antes da interrupção

- [x] Todas as migrations até a 0062 aplicadas em Postgres temporário local, sem alterar o Supabase.
- [x] Rodada focalizada anterior: 12 testes aprovados, incluindo isolamento entre tenants, revisão do carrinho, preço adulterado e checkout concorrente.
- [x] Primeira rodada de navegador: catálogo, produto, persistência do carrinho, checkout manual, consulta do pedido e confirmação administrativa.
- [x] Verificação de overflow horizontal em telas de 390 e 320 pixels nessa rodada.
- [x] TypeScript e lint passaram em uma etapa anterior às últimas alterações.
- [x] Confirmar os testes novos de limite de tentativas do login, rotação de sessão e conciliação com loja desativada: 5 testes de banco aprovados na retomada.
- [x] Concluir a segunda rodada de navegador e revisar as capturas com os dados carregados.
- [x] Reexecutar TypeScript e lint na retomada.
- [x] Concluir a suíte completa de testes: 203 aprovados, com 5 testes de banco separados, na retomada.
- [x] Executar build de produção: `npm run build:local` concluído com 98 páginas geradas, lint e TypeScript aprovados.

As execuções interrompidas não tiveram conclusão coletada. Os resultados da retomada estão registrados acima.
Não foram feitos pagamentos reais nem homologação de SMTP ou Storage nesse fluxo.

Retomada concluída: 203 testes da suíte + 5 testes de banco aprovados; navegador
desktop/390/320 validado; build aprovado sem validações concorrentes. Instruções de
ativação e limites em [ecommerce-piloto.md](ecommerce-piloto.md).

## Interrupção e execução com poucos recursos

A máquina apresenta aproximadamente 5,6 GiB de RAM. Havia execuções sobrepostas de
Vitest, TypeScript, ESLint, Next e navegador de testes. Essa concorrência pode ter
provocado a pressão de memória; o journal do boot anterior não está disponível para
confirmar o evento de OOM.

Após a reinicialização não foram encontrados processos dessas validações nem o
Postgres temporário. Os arquivos do workspace foram preservados, mas o banco e as
capturas de tela em `/tmp` não existem mais.

Na retomada:

1. Executar apenas uma validação por vez e aguardar sua conclusão.
2. Rodar Vitest com `--maxWorkers=1 --minWorkers=1 --no-file-parallelism`.
3. Parar Next e o navegador antes de TypeScript, lint ou build.
4. Recriar o banco de testes somente em uma base local `commerce_test_*` com o script `scripts/setup-commerce-test.mjs`.
5. Monitorar memória; não iniciar a suíte completa e os testes de integração juntos.
6. Manter o módulo desativado até a revisão final e homologação.

## Limites atuais do piloto

- Entrega por retirada ou valor fixo configurado, ainda sem cotação automática do Melhor Envio no checkout.
- Mercado Pago configurado por access token do vendedor; OAuth de onboarding e outros provedores ainda pendentes.
- IA pública, domínio próprio e sincronização automática de pedidos com ERP ainda pendentes.
- Imagens do catálogo configuradas por URL HTTPS, sem gerenciador completo de mídia.
- Endereços salvos do comprador, estoque/reservas, estornos operacionais, retenção de arquivos e processamento assíncrono ainda precisam evoluir.
- O editor completo de layout planejado não foi implementado; o piloto oferece identidade e catálogo configuráveis.

## Ações futuras no ambiente real

Não foi executada migration no Supabase nesta implementação. A nova migration é
`supabase/migrations/0062_optional_commerce.sql`, mas a ativação pública deve aguardar
as verificações pendentes. `.env.example` contém a nova flag; `.env` não foi alterado.
