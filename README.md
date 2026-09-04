# Painel Hyperlocal — versão estática (GitHub Pages)

Painel de Payments, SaaS P&L, Net MRR por carteira e contratos, alimentado pelo Metabase.
Abre em qualquer navegador, sem login: os dados ficam em `data.json`, regravado
automaticamente pelo GitHub Actions a cada hora.

## Colocar no ar (uma vez, ~5 minutos)

1. **Crie um repositório** no GitHub (pode ser privado — o Pages de repositório privado
   exige plano Team/Enterprise; num repositório público o link fica aberto a quem o tiver)
   e envie estes arquivos para a branch `main`.
2. **API key do Metabase**: em Metabase → Admin → Settings → Authentication → *API Keys*,
   crie uma chave para um grupo que tenha permissão de leitura nas coleções
   `0 - Hyperlocal` e `Relatórios Financeiro`.
3. **Guarde a chave no repositório**: Settings → Secrets and variables → Actions →
   *New repository secret* → nome `METABASE_API_KEY`.
4. **Ative o Pages**: Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
5. **Rode a primeira atualização**: aba Actions → *Atualizar dados do painel* → *Run workflow*.

O painel fica em `https://<usuario-ou-org>.github.io/<repositorio>/` e, dali em diante,
o Actions consulta o Metabase de hora em hora e republica sozinho.

## Arquivos

| arquivo | função |
|---|---|
| `index.html` | o painel (abas, gráficos, filtros). Lê `data.json`; se não existir, tenta o conector Metabase do claude.ai |
| `data.json` | resultado das 22 perguntas do Metabase + data/hora da coleta |
| `fetch_data.py` | consulta o Metabase pela API e grava `data.json` |
| `.github/workflows/refresh.yml` | agenda a coleta (a cada hora) e faz o commit |

## Ajustes comuns

- **Frequência**: mude o `cron` em `refresh.yml` (ex.: `0 9,13,18 * * *` = 6h, 10h e 15h de Brasília).
- **Nova pergunta**: adicione o id em `fetch_data.py` (`QUESTIONS`) e use-o em `index.html` (`const Q`).
- **Rodar localmente**: `METABASE_API_KEY=... python3 fetch_data.py` e abra `index.html` com um servidor local
  (ex.: `python3 -m http.server`), pois navegadores bloqueiam `fetch` de arquivo em `file://`.
