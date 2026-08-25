# Checklist de Implementacao

Status atualizado durante a refatoracao inicial.

## Planejado x Realizado

- [x] Criar documento de arquitetura multi-tenant.
- [x] Criar fundacao NextJS com TypeScript.
- [x] Configurar Tailwind, Vitest e TypeScript.
- [x] Criar dominio puro de precificacao.
- [x] Criar testes TDD para precificacao.
- [x] Criar dominio puro de embalagem/frete.
- [x] Criar testes TDD para embalagem.
- [x] Criar validacao testada de CPF/CNPJ.
- [x] Criar migrations multi-tenant para Supabase/Postgres.
- [x] Criar RBAC inicial com roles e permissions.
- [x] Criar RLS basica por tenant.
- [x] Criar seed inicial de produtos Botton e curvas atuais.
- [x] Criar script para gerar hash de senha.
- [x] Criar exemplo de seed do usuario owner.
- [x] Criar `.env.example`.
- [x] Criar `.env` local com placeholders.
- [x] Remover configuracoes por tenant do `.env`.
- [x] Criar migration para perfil do tenant e integracoes por tenant.
- [x] Criar utilitario para criptografar credenciais por tenant.
- [x] Implementar conexao Postgres.
- [x] Implementar auth inicial com cookie HttpOnly e JWT assinado.
- [x] Implementar login/logout.
- [x] Implementar API `/api/me`.
- [x] Implementar API `/api/products`.
- [x] Implementar API `/api/pricing/calculate`.
- [x] Implementar API `/api/customers`.
- [x] Implementar API `/api/quotes`.
- [x] Criar demo publica com dados ficticios.
- [x] Criar dashboard autenticado.
- [x] Criar precificador inicial autenticado.
- [x] Rodar lint local.
- [x] Rodar typecheck local.
- [x] Rodar testes unitarios locais.
- [x] Rodar build local.
- [x] Persistir orcamentos com item e snapshot de calculo.
- [x] Criar migration para permitir insert de auditoria por tenant.
- [x] Criar cadastro/listagem inicial de clientes.
- [x] Criar tela inicial de orcamentos.
- [x] Conectar precificador autenticado aos canais do tenant.
- [x] Adicionar dominio testado de snapshots/transicoes de orcamento.
- [x] Criar CRUD inicial de produtos.
- [x] Criar exclusão segura de produto com confirmação digitada, auditoria e preservação dos orçamentos históricos.
- [x] Criar cadastro inicial de variantes.
- [x] Criar cadastro inicial de curvas por ancoragem.
- [x] Criar edicao inicial de ancoragens/curvas.
- [x] Criar CRUD inicial de plataformas/canais.
- [x] Corrigir template SQL do seed admin.
- [x] Documentar plano técnico da API para agentes conversacionais.
- [x] Documentar guia de uso para o agente Lia Flow consumir o Pricing Pro.
- [x] Criar migration de API keys/idempotência para agentes.
- [x] Criar autenticação Bearer token para `/api/agent/v1`.
- [x] Criar endpoints agent para produtos, cálculo, frete, orçamento composto, PDF, WhatsApp e link público.
- [x] Proteger links públicos com expiração fixa de 3 dias, revogação manual e OTP opcional por e-mail.
- [x] Permitir que administradores liberem orçamentos aprovados para edição mediante observação obrigatória e auditoria.
- [x] Recuperar o link público ativo na área administrativa usando token criptografado em repouso.
- [x] Permitir desconto percentual ou fixo no orçamento, com motivo, histórico, PDF, WhatsApp e integração Olist.
- [x] Aplicar rate limit nos endpoints públicos de decisão, PDF, artes e assistente criativo.
- [x] Validar o conteúdo real dos uploads públicos e normalizar PNG/JPEG/WebP para WebP seguro.
- [x] Mascarar dados de contato, impedir cache/indexação e adicionar headers de segurança na área pública.
- [x] Criar script para gerar API key de agente por tenant.
- [x] Criar UI em Configurações para listar, criar e revogar chaves de agente.
- [x] Criar prompt de desenvolvimento para o módulo Lia Flow consumir a API do Pricing Pro.
- [ ] Criar CRUD de curvas.
- [x] Criar CRUD de clientes.
- [x] Criar CRUD inicial de embalagens.
- [x] Criar script para importar `boxes.csv` para o banco.
- [x] Criar endpoint de estimativa de embalagem.
- [x] Reimplementar adapter Correios na nova arquitetura.
- [x] Criar endpoint autenticado de cotacao Correios.
- [x] Criar tela inicial de cotacao de frete.
- [x] Criar script para configurar credenciais Correios por tenant.
- [x] Criar adapter Melhor Envio.
- [x] Criar configuracao Melhor Envio por tenant.
- [x] Criar configuração visual da API dos Correios por tenant.
- [x] Criar solicitação pública para novos tenants com confirmação de e-mail.
- [x] Criar fila de aprovação, pedido de informações e rejeição no superadmin.
- [x] Provisionar tenant, owner, plano, trial e convite após aprovação.
- [x] Criar termos versionados e aceite auditável no primeiro acesso.
- [x] Bloquear páginas e APIs operacionais até o aceite vigente.
- [x] Criar onboarding inicial para empresa, produtos, canais e embalagens.
- [x] Criar API de autenticacao OAuth URL/refresh para Melhor Envio.
- [x] Criar API de cotacao Melhor Envio.
- [x] Criar APIs proxy para carrinho, checkout, geracao, impressao e rastreio Melhor Envio.
- [x] Criar migration de shipments vinculados a orcamentos.
- [x] Criar pagina de detalhe do orcamento.
- [x] Criar alteracao de status do orcamento.
- [x] Criar texto de WhatsApp do orcamento.
- [x] Criar vinculo inicial de envios/shipments ao orcamento.
- [x] Gerar PDF do orcamento pela nova arquitetura.
- [x] Criar acoes visuais de Melhor Envio por shipment no detalhe do orcamento.
- [x] Persistir payload/resposta/status das etapas Melhor Envio em shipments.
- [x] Criar migration de endereco completo para tenant e clientes.
- [x] Criar tela de configuracoes do tenant/remetente.
- [x] Ampliar cadastro de cliente com endereco completo.
- [x] Criar gerador de payload base Melhor Envio a partir do orcamento.
- [x] Criar teste TDD para payload base Melhor Envio.
- [x] Persistir snapshot de embalagem e cotacao selecionada no shipment.
- [x] Preencher `volumes` do payload Melhor Envio a partir do shipment.
- [x] Criar rota de payload guiado por shipment e operacao Melhor Envio.
- [x] Atualizar UI de shipment para preparar payload antes de executar cada operacao.
- [x] Criar fluxo guiado de compra/geracao/rastreio de etiqueta Melhor Envio no shipment.
- [x] Criar callback OAuth Melhor Envio com troca automatica de `code` por tokens.
- [x] Criar tela de configuracao/autorizacao OAuth Melhor Envio em `/settings`.
- [x] Persistir renovacao de access token Melhor Envio no banco.
- [x] Criar regras testadas de gestao de usuarios e roles.
- [x] Criar tela `/users` para membros multi-user por tenant.
- [x] Criar APIs para listar, criar, atualizar e remover membros do tenant.
- [x] Criar policy/funcoes para gestao de membros por `users:manage`.
- [x] Criar fluxo de convite com link e definicao de senha pelo usuario.
- [x] Criar pagina publica `/invite/[token]` para ativacao de acesso.
- [x] Criar Precificador 2.0 com visual dark, graficos e simulacao de ancoragens.
- [x] Criar dominio testado para series de simulacao e comparacao de curvas.
- [x] Criar botoes de orcamento rapido no precificador para PDF e WhatsApp.
- [x] Permitir ordenacao dos canais para definir canal padrao do precificador.
- [x] Criar ordenacao visual de canais por arrastar e soltar.
- [x] Criar grafico denso do precificador com tooltip e ancoras destacadas.
- [ ] Importar `boxes.csv` no banco do ambiente alvo.
- [ ] Configurar credenciais Correios no banco do ambiente alvo.
- [ ] Configurar credenciais Melhor Envio no banco do ambiente alvo.
- [x] Criar configuracao Olist/CRM por tenant.
- [x] Criar adapter HTTP configuravel para Olist/CRM.
- [x] Criar payload testado de cliente Olist.
- [x] Criar payload testado de orcamento para CRM Olist.
- [x] Criar botoes no detalhe do orcamento para sincronizar cliente e enviar orcamento.
- [ ] Homologar paths e respostas reais Olist/CRM no ambiente alvo.
- [x] Criar painel `/audit` para eventos do tenant e logs de integracao.
- [x] Cobrir auditoria das escritas principais da aplicacao.
- [x] Criar versionamento persistido de curvas de precificacao.
- [ ] Criar testes e2e com Playwright.
- [ ] Revisar `npm audit` e atualizar dependencias vulneraveis sem quebrar Next/Vitest.

## Validacao Local

### Produção de artes

- [x] Cadastrar formato, dimensões, cantos e orientação de impressão por variante.
- [x] Manter compatibilidade com produtos circulares antigos que possuem somente diâmetro.
- [x] Preservar a imagem original e preparar uma versão recortada no formato do produto em PNG.
- [x] Calcular pixels, sangria e alerta de qualidade pela resolução configurada.
- [x] Aprovar uma única versão de arte por item com auditoria.
- [x] Gerar PDF A4 na escala física e na quantidade do orçamento.
- [x] Distribuir automaticamente artes iguais e mistas na folha, incluindo rotação opcional de formatos retangulares.
- [x] Iniciar a imposição pelo topo, reservar margem inferior de segurança e manter no mínimo 3 mm entre artes.
- [x] Configurar folha, margem, sangria, área segura, intervalo, DPI e linhas de corte por tenant.
- [x] Gerar direção criativa textual e novas imagens via OpenRouter.
- [x] Limitar a geração por IA por item do orçamento, com padrão 3, configuração por tenant no Superadmin e aplicação no acesso público.
- [x] Manter aprovação humana obrigatória para imagens geradas por IA.
- [x] Adicionar testes unitários de preparação, quantidade e PDF.
- [x] Armazenar novos originais, preparados e PDFs em Supabase Storage privado, com fallback legado.
- [x] Adicionar editor visual de enquadramento, zoom e rotação com contorno específico por formato.
- [x] Permitir zoom out no enquadramento e preencher em branco a área sem imagem.
- [x] Permitir deslocamento horizontal e vertical independente do zoom, inclusive com a imagem em 1x.
- [x] Gerar linhas de corte para círculo, quadrado, retângulo, triângulo e hexágono, com cantos retos ou arredondados.
- [x] Instruir o assistente criativo com a geometria e a proporção reais do produto.
- [x] Distribuir a quantidade de um item entre várias artes aprovadas.
- [x] Pré-visualizar as folhas A4 antes do download.
- [x] Permitir envio público de arte pronta pelo item do orçamento e pelo estúdio, sem depender do assistente criativo.
- [x] Editar artes de forma não destrutiva com pincel, conta-gotas, borracha, preenchimento por tolerância, seleção, ajustes, comparação, sangria externa e autosave.
- [x] Redimensionar a arte principal e estender fundos com uma camada duplicada ajustável em escala, milímetros e suavização.
- [x] Unificar as guias de sangria, corte e segurança entre retoque e enquadramento, exibindo suas medidas físicas.
- [x] Permitir retoques sucessivos sem consumir o limite de dez artes independentes por item.
- [x] Disponibilizar download separado da arte original, da versão retocada e da versão preparada/recortada.
- [x] Registrar lotes de produção e permitir marcá-los como impressos.
- [ ] Migrar em lote os arquivos legados que ainda estão em `data_url`.

Ultima validacao executada:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Resultado:

- lint passou;
- typecheck passou;
- testes passaram: 139 testes em 32 arquivos;
- build Next passou.

## Acoes Manuais Pendentes

### Módulo financeiro

- [x] Criar modelo multi-tenant, permissões e RLS para dados financeiros.
- [x] Preservar arquivos originais e linhas brutas imutáveis.
- [x] Implementar adapters Nubank, Olist Conta Digital e Mercado Pago com fixtures reais.
- [x] Preparar adapters PayPal e CSV genérico com mapeamento.
- [x] Implementar preview, importação transacional e deduplicação por checksum.
- [x] Implementar classificação manual/em lote e criação de regras do tenant.
- [x] Criar regras iniciais exclusivas da Ground Shop.
- [x] Identificar transferências e excluir automaticamente somente pares empresariais de alta confiança.
- [x] Implementar dashboard, filtros, fechamento e reabertura auditada.
- [x] Exportar CSV e Excel com proteção contra formula injection.
- [x] Implementar conciliação assistida Olist em modo leitura.
- [x] Validar os valores de regressão de julho de 2026.
- [x] Restringir temporariamente menu, página e APIs financeiras a owner/admin/superadmin.
- [ ] Homologar o adapter com um CSV PayPal real.
- [ ] Implementar IA opcional para classificação, recorrência e anomalias.
- [ ] Implementar escrita assistida no Olist somente após homologação contábil e de idempotência.
- [ ] Adicionar PDF gerencial, histórico multi-mês e médias móveis.

Rode `supabase/migrations/0054_financial_statements.sql` antes de acessar `/finance`.

Importar as caixas do `boxes.csv` para o tenant `ground-shop`:

```bash
npm run import:boxes -- ground-shop boxes.csv
```

Esse comando usa `DATABASE_URL` e `DATABASE_SSL` do `.env`.

Configurar credenciais Correios para o tenant `ground-shop`:

```bash
npm run configure:correios -- ground-shop 'TOKEN_CORREIOS' 'CONTRATO_CORREIOS'
```

Depois disso a tela `/shipping` consegue cotar SEDEX/PAC usando as embalagens cadastradas/importadas.

Configurar Melhor Envio pelo fluxo OAuth em `/settings`. Cadastre no app do Melhor Envio o callback `${APP_URL}/api/melhor-envio/oauth/callback`, salve Client ID/Secret na tela e autorize o aplicativo.

Configurar Olist/CRM em `/settings`. Informe Base URL, path de cliente, path de orcamento, token e formato de autenticacao conforme o ambiente alvo.

Ponto de atencao:

- `npm audit fix` verificou que não havia outra correção compatível. Permaneceram 10 alertas transitivos; eliminá-los exige upgrades com quebra (`Next 16`, `Vitest 4` e downgrade do `ExcelJS`). Não foi usado `--force` para não introduzir regressões sem uma migração dedicada.

## Migrations Criadas

1. `supabase/migrations/0001_multitenant_core.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_seed_ground_shop.sql`
4. `supabase/migrations/0004_tenant_profile_integrations.sql`
5. `supabase/migrations/0005_audit_log_insert_policy.sql`
6. `supabase/migrations/0006_shipments.sql`
7. `supabase/migrations/0007_addresses.sql`
8. `supabase/migrations/0008_shipment_packaging_snapshot.sql`
9. `supabase/migrations/0009_oauth_states.sql`
10. `supabase/migrations/0010_user_management_policies.sql`
11. `supabase/migrations/0011_user_invites.sql`

## Execucao Recomendada no Supabase

1. Rode `0001_multitenant_core.sql`.
2. Rode `0002_rls_policies.sql`.
3. Rode `0003_seed_ground_shop.sql`.
4. Rode `0004_tenant_profile_integrations.sql`.
5. Rode `0005_audit_log_insert_policy.sql`.
6. Rode `0006_shipments.sql`.
7. Rode `0007_addresses.sql`.
8. Rode `0008_shipment_packaging_snapshot.sql`.
9. Rode `0009_oauth_states.sql`.
10. Rode `0010_user_management_policies.sql`.
11. Rode `0011_user_invites.sql`.
12. Gere o hash de senha:

```bash
node scripts/hash-password.mjs 'SUA_SENHA_FORTE'
```

13. Copie `supabase/seed-admin.example.sql`, substitua email, nome e hash, e rode no SQL Editor.

## Observacoes

- O demo usa apenas dados ficticios.
- A area autenticada ja espera dados no Supabase.
- As curvas reais ja ficam no banco depois da migration de seed.
- A primeira versao do precificador autenticado carrega produtos e curvas do tenant.
