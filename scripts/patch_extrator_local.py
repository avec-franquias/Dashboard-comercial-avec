import base64
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

INDEX = Path("index.html")
GEO = Path("geo/bairros-br.json")
BAIRROS_URL = "https://raw.githubusercontent.com/chandez/Estados-Cidades-IBGE/master/json/bairros.json"

def chave(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.casefold().strip().split())

print("Baixando base nacional de bairros...")
req = urllib.request.Request(BAIRROS_URL, headers={"User-Agent":"Portal-do-Franqueado/1.0"})
with urllib.request.urlopen(req, timeout=60) as r:
    bruto = json.load(r)

mapa = {}
for item in bruto.get("data", []):
    uf = str(item.get("Uf") or "").strip().upper()
    nome = str(item.get("Nome") or "").strip()
    if not uf or " - " not in nome:
        continue
    bairro, cidade = nome.rsplit(" - ", 1)
    bairro, cidade = bairro.strip(), cidade.strip()
    if not bairro or not cidade:
        continue
    mapa.setdefault(uf, {}).setdefault(chave(cidade), set()).add(bairro)

saida = {}
for uf, cidades in sorted(mapa.items()):
    saida[uf] = {
        cidade: sorted(list(bairros), key=lambda x: chave(x))
        for cidade, bairros in sorted(cidades.items())
    }

GEO.parent.mkdir(parents=True, exist_ok=True)
GEO.write_text(json.dumps(saida, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
print("Base gerada:", sum(len(v) for u in saida.values() for v in u.values()), "bairros")

html = INDEX.read_text(encoding="utf-8")
m = re.search(r'(<script[^>]+id="modulosEmbutidos"[^>]*>)(.*?)(</script>)', html, re.S)
if not m:
    raise SystemExit("modulosEmbutidos nao encontrado")
mods = json.loads(m.group(2))
e = base64.b64decode(mods["extrator"]).decode("utf-8")

# Remove a excecao de Joinville e passa a usar uma unica base nacional.
e = re.sub(
    r"const JOINVILLE_BAIRROS=\[.*?\];\n",
    """let BAIRROS_BR=null;
function chaveGeo(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\\s+/g,' ')}
async function carregarBaseBairros(){
  if(BAIRROS_BR) return BAIRROS_BR;
  const r=await fetch('geo/bairros-br.json?ts=20260918',{cache:'force-cache'});
  if(!r.ok) throw new Error('Base nacional de bairros indisponivel');
  BAIRROS_BR=await r.json();
  return BAIRROS_BR;
}
""",
    e,
    count=1,
    flags=re.S,
)

novo_bairros = """async function atualizarBairros(){
  const cidade=$('#cidade').value;
  $('#bairro').disabled=true;
  opts('#bairro',['Carregando bairros...'],'Carregando bairros...');
  try{
    const partes=cidade.split(',');
    const uf=(partes.pop()||$('#estado').value||'').trim().toUpperCase();
    const nome=partes.join(',').trim();
    const conhecidos=(DATA.runs||[])
      .filter(r=>norm(r.query?.cidade)===norm(cidade))
      .map(r=>r.query?.bairro).filter(Boolean);
    let bairros=[];
    try{
      const base=await carregarBaseBairros();
      bairros=base?.[uf]?.[chaveGeo(nome)]||[];
    }catch(err){
      console.warn(err);
    }
    bairros=[...new Set([...bairros,...conhecidos])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    opts('#bairro',['Todos os bairros',...bairros],'Todos os bairros');
  } finally {
    $('#bairro').disabled=false;
  }
}
async function build(){"""

e, n = re.subn(
    r"async function atualizarBairros\(\)\{.*?\n\}\nasync function build\(\)\{",
    novo_bairros,
    e,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit("funcao atualizarBairros nao encontrada")

mods["extrator"] = base64.b64encode(e.encode("utf-8")).decode("ascii")
html = html[:m.start(2)] + json.dumps(mods, separators=(",",":")) + html[m.end(2):]
INDEX.write_text(html, encoding="utf-8")
print("Extrator atualizado com base nacional de bairros")
