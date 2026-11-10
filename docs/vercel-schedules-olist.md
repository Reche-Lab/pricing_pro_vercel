# Vercel Schedules para a fila Olist

## Checklist

- [x] Skill oficial `vercel-schedules` instalada no projeto e revisada.
- [x] Pasta vinculada ao projeto existente `brunos-projects-1302295e/liaflow-calcula`, sem publicar.
- [x] Plano Pro e disponibilidade de Schedules confirmados por consultas de leitura.
- [x] SDK `@vercel/schedules` instalado sem atualizar versões das dependências existentes.
- [x] Schedule estático e função privada declarados em `vercel.json`, mantendo o build Next.js padrão.
- [x] Proteções de ambiente, deduplicação e logs de execução implementados.
- [x] Testes locais de CloudEvents, bloqueio de Preview/desenvolvimento, duplicidade e falha aprovados.
- [x] Build Vercel local aprovado: alvo `api/schedules/commerce-olist`, trigger privado `schedule/v1beta` e schedule presentes no build output.
- [ ] Publicar esta versão e conferir o schedule no painel de produção.
- [ ] Homologar a execução real com a integração do tenant devidamente configurada.

## O que foi configurado

O schedule chama diretamente a função privada `api/schedules/commerce-olist`, construída a partir de `src/app/api/schedules/commerce-olist/route.ts`.

```json
{
  "schedules": {
    "commerce-olist": {
      "schedule": "* * * * *",
      "timezone": "America/Sao_Paulo",
      "jitter": 1,
      "function": "api/schedules/commerce-olist"
    }
  }
}
```

O arquivo real também declara `experimentalTriggers: [{ "type": "schedule/v1beta" }]` no alvo, tornando-o privado na Vercel. Não acrescente `path`, rewrites ou outro tipo de trigger para essa função.

O intervalo nominal é de um minuto, não uma garantia de execução exata no segundo zero. O jitter permite que a entrega ocorra dentro da janela de um minuto. A cada execução, o worker existente seleciona até um pedido elegível; a fila e as etapas persistidas continuam responsáveis por concluir o processo e retomar falhas em execuções futuras.

Somente tenants com Olist e automação da loja habilitados entram na fila. A configuração não ativa a integração dos tenants nem cria documentos retroativamente.

## Publicação e acompanhamento

1. Confirme que a migration **0074_commerce_olist_automation.sql** já foi aplicada. Esta configuração de Schedule não exige uma nova migration.
2. Faça commit/push e aguarde o deploy de produção, ou publique explicitamente com a CLI atual:

```bash
npx vercel@latest deploy --prod --scope brunos-projects-1302295e
```

3. Abra o projeto `liaflow-calcula` no painel Vercel e selecione **Schedules**, ambiente **Production**.
4. Confira **commerce-olist**, alvo `api/schedules/commerce-olist`, frequência a cada minuto e estado ativo.
5. Depois de homologar/configurar a integração do tenant, use **Run Schedule** para uma execução imediata e acompanhe **Execution History** e **Function Logs**.

**Run Schedule executa operações reais da fila.** Uma nota somente será solicitada se o pagamento, produção e demais requisitos do worker estiverem satisfeitos. Não use esse botão para testar conectividade sem antes conferir os pedidos pendentes.

Consultas sem executar a fila:

```bash
npx vercel@latest schedules list --scope brunos-projects-1302295e
npx vercel@latest schedules inspect commerce-olist --scope brunos-projects-1302295e
npx vercel@latest schedules executions list commerce-olist --scope brunos-projects-1302295e
```

Pausar ou retomar:

```bash
npx vercel@latest schedules disable commerce-olist --scope brunos-projects-1302295e
npx vercel@latest schedules enable commerce-olist --scope brunos-projects-1302295e
```

A CLI global encontrada no computador era a 46.1.0, anterior a Schedules. Use `npx vercel@latest` (65.14.0 na validação) ou atualize a instalação global. A CLI antiga não deve ser usada para publicar este `vercel.json`.

## Segurança, ambientes e retomada

- O alvo privado não tem uma URL pública na Vercel. O isolamento vem do trigger da plataforma, não de cabeçalhos CloudEvent nem de um segredo estático.
- `handleSchedule` valida os metadados do evento. Sem eles, uma chamada comum é recusada antes de acessar a fila.
- Preview e desenvolvimento nunca processam o ERP neste handler, mesmo que recebam cabeçalhos sintéticos válidos. `next dev` expõe rotas localmente, por isso essa proteção adicional é importante.
- `COMMERCE_ENABLED` precisa estar `true` em produção; as demais variáveis de banco, criptografia e credenciais por tenant são as mesmas do módulo existente.
- Execuções concluídas são deduplicadas por `executionId` durante sete dias, usando `commerce_olist_leases` da migration 0074. Recebimentos em andamento possuem lease de dois minutos. O worker conserva as próprias proteções por pedido/documento e contra repetição de mutações incertas.
- O alvo `function` não tem retries automáticos da plataforma. A execução seguinte consulta a fila persistida; falhas incertas e OAuth continuam exigindo a retomada/reconexão já definida no módulo.
- O `CRON_SECRET` é opcional e serve somente à rota alternativa `/api/cron/commerce-olist`. Não é necessário cadastrá-lo para o Schedule privado.
- Logs registram `executionId`, horário nominal, duração e quantidade de pedidos selecionados, sem credenciais ou dados pessoais do cliente.

## Teste local

```bash
npm run test:local -- src/tests/unit/commerce-olist-schedule.test.ts
npx vercel@latest dev
```

Em outro terminal, `npx vercel@latest schedules invoke commerce-olist --local` testa o recebimento do evento localmente. O handler registra o descarte fora de produção e **não envia nada ao ERP**. `npm run dev` sozinho não inicia o agendador da Vercel.

## Limites e problemas comuns

- **Schedule não aparece:** a configuração só é aplicada quando o deploy se torna atual. Confira se o build utilizou CLI/builder atual e se o recurso Beta está liberado para a equipe.
- **Deploy acusa alvo inexistente/sem trigger:** confira o nome da função no build output e mantenha o trigger `schedule/v1beta`.
- **Recurso não habilitado (`not_enabled`):** habilite/solicite Schedules no painel da equipe antes de publicar; não substitua silenciosamente por uma rota sem autenticação.
- **Fila não avança:** confira `COMMERCE_ENABLED`, migration 0074, Olist cadastrado, opt-in da loja, permissões OAuth e erros do pedido. Uma execução selecionando zero pedidos é normal se a fila estiver vazia.
- **Plano Hobby:** use `*/15 * * * *` com `jitter: 15`; um schedule de um minuto não é permitido. Alterar plano/cadência afeta tempo de retomada e consumo.
- **Duplicação de agendamento:** remova qualquer cron externo/legado que chamava a mesma fila antes de ativar este Schedule.

Referências: [configuração](https://vercel.com/docs/schedules/configuration), [funções e segurança](https://vercel.com/docs/schedules/handle-runs), [limites por plano](https://vercel.com/docs/schedules/limits), [gerenciamento](https://vercel.com/docs/schedules/manage).
