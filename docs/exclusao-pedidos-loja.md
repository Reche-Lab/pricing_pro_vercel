# Exclusão administrativa de pedidos da loja

## Checklist

- [x] Botão na central, nos últimos pedidos de Loja online e no pedido individual.
- [x] Acesso exclusivo de owner/admin do tenant ativo e superadmin autenticado, validado no servidor.
- [x] Confirmação por digitação de `EXCLUIR CODIGO` e motivo obrigatório de 5 a 500 caracteres.
- [x] Proteção de origem, UUID, tamanho da requisição e isolamento de tenant.
- [x] Exclusão lógica com data, autor, motivo, evento do pedido e auditoria na mesma transação.
- [x] Pedidos excluídos fora de listagens, totais e alertas administrativos, inclusive pedidos de teste.
- [x] Bloqueio de avanço de produção, edição de artes e impressão administrativa após a exclusão.
- [x] Testes locais de interface, autorização, concorrência, isolamento e preservação dos registros.
- [x] TypeScript, lint, build e revisão visual em desktop/mobile.
- [ ] Aplicar `0073_commerce_order_soft_delete.sql` no Supabase antes do deploy (ação do administrador).

## Comportamento

O modal identifica o pedido, o cliente e o valor antes de liberar a ação. É preciso
digitar a confirmação exibida e informar um motivo. A ação fica restrita à empresa
da sessão; o navegador não escolhe tenant ou autor. Permissões operacionais de
gestão de produção ou edição de artes não concedem permissão de exclusão.

O pedido recebe `deleted_at`, `deleted_by` e `deletion_reason`. A exclusão não
destrói pagamentos, tentativas, webhooks, arquivos, provas ou a compra no histórico
do cliente. Não realiza estorno, não cancela pagamentos externos, ERP ou frete e
não pode ser interpretada como cancelamento comercial. O aviso é exibido antes da
confirmação. Não há restauração pela interface nesta versão.

Repetir a mesma exclusão não duplica eventos/auditoria nem altera o primeiro
motivo. O registro é bloqueado durante a transação para coordenar ações
concorrentes. O cliente continua autorizado a consultar seu histórico e seus
comprovantes, enquanto as ferramentas de alteração das artes ficam bloqueadas.

## Ativação

Execute `supabase/migrations/0073_commerce_order_soft_delete.sql` após as migrations
anteriores e antes de publicar este código. Não há novas variáveis de ambiente,
policies públicas ou permissões concedidas a outros perfis.

## Verificações

- Suíte geral: 723 testes aprovados; integrações opcionais sem banco não executam nessa rodada.
- PostgreSQL local: todas as 73 migrations aplicadas em banco vazio; 25 testes de integração de loja e biblioteca aprovados.
- O teste de exclusão usa pedido com provas de arte, verifica preservação dos arquivos referenciados e do histórico do comprador, idempotência, auditoria única e remoção da central, dos alertas e dos últimos pedidos.
- Um teste antigo selecionava pedidos apenas pelo e-mail, que podia repetir em pedidos com e sem arte. A seleção foi restringida ao pedido com prova para tornar a validação determinística.
- TypeScript, ESLint e build de produção aprovados, com heap e workers limitados.
- Chrome: exclusão pela central em 1440 px, pelo pedido individual em 390 px e pelos últimos pedidos em 320 px. Confirmados: bloqueio de código incorreto, motivo obrigatório, remoção bem-sucedida, preservação do valor/status financeiro e ausência de overflow horizontal.
- Nenhum pedido de produção ou serviço externo foi alterado nos testes.
