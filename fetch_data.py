#!/usr/bin/env python3
"""Consulta as perguntas do Metabase usadas pelo Painel Hyperlocal e grava data.json.

Uso:
  METABASE_URL=https://metabase.hyperlocal.com.br METABASE_API_KEY=mb_xxx python3 fetch_data.py

A API key é criada em Metabase → Admin → Settings → Authentication → API Keys
(um grupo com permissão de leitura nas coleções usadas basta).
"""
import json, os, sys, time, datetime, urllib.request, urllib.error

BASE = os.environ.get("METABASE_URL", "https://metabase.hyperlocal.com.br").rstrip("/")
KEY = os.environ.get("METABASE_API_KEY")
if not KEY:
    sys.exit("Defina METABASE_API_KEY")

# id da pergunta -> nome (só documentação; os ids são os usados em index.html)
QUESTIONS = {
    1657: "Painel Gerencial Payments - TPV mês atual",
    1658: "Painel Gerencial Payments - TPV mês anterior",
    2520: "Painel Gerencial Payments - Take Rate Bruto",
    1655: "Painel Gerencial Payments - Quantidade de clientes no mês",
    2484: "Painel Gerencial Payments - Evolução do TPV por semana",
    2488: "Painel Gerencial Payments - TPV mês atual vs. mês ano -1",
    2489: "Painel Gerencial Payments - ECs mês atual vs. mês ano -1",
    1675: "Painel Gerencial Payments - TPV por adquirente",
    1670: "Painel Gerencial Payments - TPV por tipo de pagamento",
    5116: "Painel Gerencial Payments - TPV por MCC",
    2621: "Analítico Payments - TPV e Clientes e Taxa por Tier",
    2628: "Analítico Payments - Ev. TPV",
    2629: "Analítico Payments - Ev. Clientes",
    6971: "[Claude] SaaS P&L - MRR por vertical",
    6972: "[Claude] SaaS P&L - Base ativa por produto",
    6973: "[Claude] Net MRR Avec por carteira e status",
    6692: "Contratos Ativos",
    6702: "Contratos Suspensos",
    6695: "Contratos Cancelados",
    6696: "Total de contratos",
    6704: "Contratos a Vencer",
    6713: "Aging de Inadimplência",
}

def run(card_id, tries=3):
    req = urllib.request.Request(
        f"{BASE}/api/card/{card_id}/query",
        data=b"{}", method="POST",
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
    )
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                body = json.load(r)
            data = body.get("data") or {}
            return {"cols": [{"name": c.get("name")} for c in data.get("cols", [])],
                    "rows": data.get("rows", [])}
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f"  tentativa {attempt+1} falhou para {card_id}: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    return None

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
previous = {}
if os.path.exists(out_path):
    try:
        previous = json.load(open(out_path, encoding="utf-8")).get("results", {})
    except Exception:
        pass

results, failed = {}, []
for cid, name in QUESTIONS.items():
    print(f"{cid} {name}")
    res = run(cid)
    if res is None:
        failed.append(cid)
        if str(cid) in previous:  # mantém o último resultado bom
            results[str(cid)] = previous[str(cid)]
    else:
        results[str(cid)] = res

snapshot = {
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "failed": failed,
    "results": results,
}
json.dump(snapshot, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"gravado {out_path} · {len(results)} consultas · falhas: {failed or 'nenhuma'}")
sys.exit(1 if len(results) == 0 else 0)
