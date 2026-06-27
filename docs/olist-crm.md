# Integracao Olist e CRM

## Status

Implementacao inicial configuravel por tenant.

Como os endpoints reais podem variar por conta/ambiente, a configuracao fica em `/settings`:

- `olist`: criacao/sincronizacao de cliente;
- `olist_crm`: envio de orcamento/cotacao ao CRM.

## APIs internas

```txt
GET  /api/integrations/olist
POST /api/integrations/olist
POST /api/quotes/:quoteId/olist/customer
POST /api/quotes/:quoteId/olist/crm
```

## Fluxo

1. Configure Base URL, path, token e tipo de autenticacao em `/settings`.
2. No detalhe do orcamento, clique em `Criar cliente Olist`.
3. O sistema monta o payload do cliente, envia ao endpoint configurado e salva `external_olist_id` se a resposta retornar um ID reconhecivel.
4. Clique em `Enviar orcamento CRM`.
5. O sistema monta o payload do orcamento, envia ao endpoint configurado e salva `external_crm_id` se a resposta retornar um ID reconhecivel.

Todas as chamadas gravam logs em `integration_logs`.

## Pendencias

- Homologar paths reais de cliente e CRM no ambiente alvo.
- Ajustar payloads conforme contrato final da API Olist/CRM.
- Ajustar extracao de IDs externos com base nas respostas reais.
