# Extrator de Instagram - backend

Backend do modulo **Extrator de Instagram** do Portal do Franqueado.

## Executar

Node.js 20+:

```
npm start
```

Variaveis:
- `PORT`: porta HTTP (padrao 8787)
- `PORTAL_ORIGIN`: origem autorizada do Portal
- `INSTAGRAM_PROVIDER_URL`: endpoint do mecanismo de descoberta/coleta publica rodando na infraestrutura
- `INSTAGRAM_PROVIDER_TOKEN`: token opcional do provider

Endpoints:
- `GET /health`
- `POST /api/instagram/search`
- `GET /api/instagram/leads`

O backend deduplica perfis por `username` e grava os leads em `data/leads.json`.

O mecanismo de coleta fica desacoplado de proposito: ele deve usar uma integracao ou fonte que voce esteja autorizado a consultar. Nao ha codigo para contornar login, CAPTCHA, bloqueios ou controles de acesso do Instagram.
