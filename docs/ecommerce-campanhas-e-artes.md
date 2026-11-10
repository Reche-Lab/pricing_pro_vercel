# Campanhas e artes da loja

## Checklist de implementação

- [x] Banco multi-tenant, categorias em dois níveis, campanhas, acervo e vínculos com produtos.
- [x] Originais privados, miniaturas, validação de arquivos e cópia isolada por cliente.
- [x] Administração: pesquisa, upload em lote, edição, publicação, arquivamento e ordenação.
- [x] Enquadramento inicial por produto, sem aprovação automática do comprador.
- [x] Loja: páginas de artes/campanhas, destaques, filtros e produtos compatíveis.
- [x] Seleção dentro do produto/carrinho e simulação na prévia privada.
- [x] Testes de regras, autorização, isolamento, compra e preservação dos pedidos.
- [x] Revisão visual desktop/mobile, TypeScript, lint e build com memória limitada.
- [ ] Aplicar a migration 0072 no Supabase antes do deploy.

## Decisões

O módulo fica desativado até o administrador habilitá-lo. Categorias de artes são
independentes das categorias de produtos; campanhas são coleções, não descontos.
Cada arte pode participar de várias campanhas e atender diversos produtos.
As quantidades e os preços continuam seguindo as regras existentes do produto.

O arquivo original do acervo não é alterado pelo cliente. A escolha cria uma cópia
privada na sessão, exige enquadramento/preparação e aprovação e segue o fluxo de
pedido e produção existente. Atualizar ou arquivar o acervo não altera pedidos
anteriores. Miniaturas públicas são derivadas de baixa resolução; fontes privadas
exigem autorização. A permissão de retoque controla as ferramentas da loja e não
constitui DRM contra capturas ou cópias feitas fora dela.

Datas opcionais da campanha usam início inclusivo e fim exclusivo, armazenados em
UTC. O período controla a coleção; a publicação da arte é independente. Conteúdos
em rascunho podem ser conferidos pela prévia autenticada, nunca pela loja pública.

Imagens PNG, JPEG ou WebP: até 3 MB, sem animação, até 25 megapixels. O servidor
valida o conteúdo real e normaliza os arquivos. Upload em lote é sequencial para
conter memória e permitir retornar erros por arquivo.

Não são fornecidas artes comerciais ou direitos de terceiros. O responsável pelo
tenant deve registrar a origem e autorização de uso dos arquivos publicados.

## Ativação e operação

1. Aplique `supabase/migrations/0072_commerce_campaign_library.sql` no projeto correto do Supabase, antes do deploy. Nenhuma loja é habilitada automaticamente.
2. Mantenha o bucket `artwork-production` **privado**. São usadas as mesmas variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do fluxo de produção; não exponha a chave no navegador. Não é necessário criar outro bucket ou liberar policies públicas para os originais. As capas utilizam o upload público de mídia da loja já existente.
3. Em **Loja online > Campanhas e artes**, use **Criar estrutura sugerida** ou cadastre suas próprias categorias e campanhas. A estrutura sugerida só cria nomes e rascunhos, nunca imagens ou publicações.
4. Em **Artes > Enviar artes**, selecione até dez arquivos, os produtos compatíveis, as campanhas e a origem/autorização. Cada envio é salvo como rascunho; falhas aparecem por arquivo e podem ser tentadas novamente sem reenviar os arquivos já concluídos naquele lote.
5. Abra cada arte, revise título, descrição, palavras-chave e vínculos, e publique. Produtos compatíveis precisam estar ativos no catálogo, ser personalizados e possuir geometria de corte. Você pode salvar um enquadramento inicial diferente para cada produto vinculado.
6. Nas campanhas, envie a capa, escolha o destaque na home e, se desejar, o período. Salve campanhas novas como rascunho antes de vincular artes. A publicação exige ao menos uma arte publicada com produto disponível.
7. Use **Pré-visualizar acervo** para conferir a biblioteca e simular a escolha, enquadramento, aprovação e carrinho com seus rascunhos. A simulação só mantém arquivos na memória do navegador e não cria pedidos ou pagamentos reais.
8. Habilite **Exibir biblioteca na loja** quando o acervo estiver pronto. As páginas públicas são `/loja/{slug}/artes`, `/loja/{slug}/campanhas` e `/loja/{slug}/campanhas/{campanha}`; no domínio próprio, começam na raiz. A navegação e o sitemap só incluem a biblioteca quando habilitada.

O comprador escolhe uma arte na biblioteca ou diretamente no produto/carrinho,
confirma **Usar esta arte**, enquadra, revisa e aprova. A quantidade e a precificação
seguem as regras do produto. A arte escolhida é enviada ao fluxo existente de
pedido, prova e impressão. Arquivar uma arte impede novas escolhas, mas não apaga
as cópias que clientes já escolheram. Para substituir o original do acervo, envie
um novo arquivo e arquive o anterior; alterações do cliente nunca sobrescrevem
o original da loja.

## Validação local

- Testes unitários de normalização, hierarquia, datas, validação, SEO e interface.
- Testes PostgreSQL com todas as 72 migrations, isolamento de tenant, autorização, origem, limpeza de uploads rejeitados, cópia de arquivos, prévia sem persistência, aprovação explícita, criação de pedido e preservação da prova de produção.
- Revisão no Chrome em 1440, 390 e 320 px, nos temas claro e escuro, com dados e imagens sintéticos. Nenhum pagamento, e-mail ou chamada ao Supabase/ERP real foi realizado.
- Checklist de aplicação da migration em produção permanece pendente para o administrador.

Resultados: suíte geral com **711 testes aprovados** (integrações opcionais sem
banco são ignoradas nessa execução); **14 testes existentes de integração da loja**
e **10 novos testes de integração da biblioteca** aprovados em PostgreSQL local.
O caso de produto desativado foi reproduzido antes da correção: vínculos antigos
podem ser mantidos/arquivados, mas novos vínculos continuam exigindo produto
personalizado disponível. Testes focados de interface/regras foram repetidos após
os ajustes finais. O build usa um worker e heap limitado a 1 GB.
