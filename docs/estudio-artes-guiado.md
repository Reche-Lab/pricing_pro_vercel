# Estúdio guiado de artes

Fluxo compartilhado pela produção administrativa, orçamento público e carrinho da
loja (incluindo a prévia privada): **Retocar (opcional) → Enquadrar → Aprovar**.

## Planejado x realizado

- [x] Mesmo estúdio no viewport, com etapas visíveis e navegação entre ferramentas.
- [x] Retoque salvo segue para enquadramento da nova versão, sem retornar à listagem.
- [x] Original preservado pelos mecanismos de versões existentes; quantidade do lote mantida.
- [x] Retoques exportam uma nova tela de imagem: o enquadramento é reiniciado e exige revisão.
- [x] Mudanças pendentes: salvar, descartar ou continuar editando; falhas não fecham o editor.
- [x] Revisão da imagem final e confirmação explícita antes da aprovação.
- [x] Reenquadramento/retocar exige nova aprovação; permissões e bloqueios continuam nas APIs existentes.
- [x] APIs administrativas, públicas e da loja permanecem separadas; a prévia não cria pedidos reais.
- [x] Testes de regressão dos adaptadores e da navegação.
- [x] Compra simulada em navegador em 1365, 390 e 320 px: upload, retoque, enquadramento, aprovação e checkout; nenhuma compra real ou arte persistida pela prévia.
- [x] Validação visual desktop/mobile e build local com limite de memória.
- [x] Suíte completa: 251 testes aprovados; TypeScript, lint e build de produção aprovados.

Os seis testes de integração de banco da suíte não foram executados nesta etapa.
A simulação de navegador utilizou um banco local isolado e não acionou pagamentos
ou armazenamento de artes reais. Os adaptadores de orçamento administrativo e
público foram cobertos por testes de componentes com respostas de API simuladas.

Nenhuma migration ou variável de ambiente adicional é necessária.
