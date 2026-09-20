import csv
import io
import json
import os
import tempfile
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "geo" / "bairros-br.json"
OUT_CSV = ROOT / "geo" / "bairros-br.csv"
OUT_SUMMARY = ROOT / "geo" / "bairros-br-resumo.json"
IBGE_ZIP = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/BR/BR_bairros_CD2022.zip"
IBGE_STATES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados"
IBGE_MUNS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios?orderBy=nome"

def key(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.casefold().strip().split())

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PortalFranqueadoAVEC/1.0", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        if raw[:2] == bytes([0x1f, 0x8b]):
            import gzip
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8"))

def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "PortalFranqueadoAVEC/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

existing = {}
if OUT_JSON.exists():
    try:
        existing = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    except Exception:
        existing = {}

states = sorted(get_json(IBGE_STATES), key=lambda x: x["sigla"])
base = {}
city_meta = {}
for st in states:
    uf = st["sigla"]
    base[uf] = {}
    for m in get_json(IBGE_MUNS.format(uf=uf)):
        k = key(m["nome"])
        base[uf][k] = set()
        city_meta[(uf, k)] = {"codigo_ibge": str(m["id"]), "cidade": m["nome"]}

# Preserva bairros já coletados no Portal.
for uf, cities in existing.items():
    if uf not in base or not isinstance(cities, dict):
        continue
    for city_key, bairros in cities.items():
        if city_key in base[uf] and isinstance(bairros, list):
            base[uf][city_key].update(str(x).strip() for x in bairros if str(x).strip())

# Adiciona os bairros oficiais do Censo 2022.
with tempfile.TemporaryDirectory() as td:
    zpath = os.path.join(td, "bairros.zip")
    download(IBGE_ZIP, zpath)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(td)
    shp_files = list(Path(td).glob("*.shp"))
    if not shp_files:
        raise RuntimeError("Shapefile de bairros do IBGE não encontrado")
    r = shapefile.Reader(str(shp_files[0]), encoding="latin1")
    fields = [f[0] for f in r.fields[1:]]
    upper = {name.upper(): name for name in fields}
    def pick(*names):
        for n in names:
            if n in upper:
                return upper[n]
        raise RuntimeError("Campo ausente. Disponíveis: " + ", ".join(fields))
    f_uf = pick("SIGLA_UF", "UF")
    f_city = pick("NM_MUN", "NM_MUNICIP", "NOME_MUN")
    f_bairro = pick("NM_BAIRRO", "NOME_BAIRR")
    idx = {name: i for i, name in enumerate(fields)}
    for rec in r.iterRecords():
        uf = str(rec[idx[f_uf]] or "").strip().upper()
        cidade = str(rec[idx[f_city]] or "").strip()
        bairro = str(rec[idx[f_bairro]] or "").strip()
        k = key(cidade)
        if uf in base and k in base[uf] and bairro:
            base[uf][k].add(bairro)

serial = {}
rows = []
cities_with = 0
cities_without = 0
neighborhoods = 0
for uf in sorted(base):
    serial[uf] = {}
    for k in sorted(base[uf]):
        arr = sorted(base[uf][k], key=key)
        serial[uf][k] = arr
        meta = city_meta[(uf, k)]
        if arr:
            cities_with += 1
            neighborhoods += len(arr)
            for bairro in arr:
                rows.append([uf, meta["codigo_ibge"], meta["cidade"], bairro])
        else:
            cities_without += 1
            rows.append([uf, meta["codigo_ibge"], meta["cidade"], ""])

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps(serial, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["UF", "codigo_ibge", "cidade", "bairro"])
    w.writerows(rows)

summary = {
    "fonte_principal": "IBGE Censo 2022 - Arquivo geoespacial de Bairros",
    "complemento": "base já coletada pelo Portal",
    "ufs": len(serial),
    "municipios": sum(len(v) for v in serial.values()),
    "municipios_com_bairros": cities_with,
    "municipios_sem_bairros_formais_na_base": cities_without,
    "bairros": neighborhoods,
    "linhas_csv": len(rows),
}
OUT_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
