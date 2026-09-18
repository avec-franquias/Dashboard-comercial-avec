import base64
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

INDEX = Path("index.html")
USERS = Path("usuarios.json")
GEO = Path("geo/bairros-br.json")
BAIRROS_URL = "https://raw.githubusercontent.com/chandez/Estados-Cidades-IBGE/master/json/bairros.json"

def chave(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.casefold().strip().split())

def b64(s):
    return base64.b64encode(s.encode("utf-8")).decode("ascii")

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
    if bairro and cidade:
        mapa.setdefault(uf, {}).setdefault(chave(cidade), set()).add(bairro)

saida = {}
for uf, cidades in sorted(mapa.items()):
    saida[uf] = {
        cidade: sorted(list(bairros), key=chave)
        for cidade, bairros in sorted(cidades.items())
    }

GEO.parent.mkdir(parents=True, exist_ok=True)
GEO.write_text(json.dumps(saida, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
print("Base gerada:", sum(len(v) for u in saida.values() for v in u.values()), "bairros")

html = INDEX.read_text(encoding="utf-8")

# --- Extrator Google Maps: bairros nacionais ---
m = re.search(r'(<script[^>]+id="modulosEmbutidos"[^>]*>)(.*?)(</script>)', html, re.S)
if not m:
    raise SystemExit("modulosEmbutidos nao encontrado")
mods = json.loads(m.group(2))
e = base64.b64decode(mods["extrator"]).decode("utf-8")

geo_js = """let BAIRROS_BR=null;
function chaveGeo(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\\s+/g,' ')}
async function carregarBaseBairros(){
  if(BAIRROS_BR) return BAIRROS_BR;
  const r=await fetch('geo/bairros-br.json?ts=20260918',{cache:'force-cache'});
  if(!r.ok) throw new Error('Base nacional de bairros indisponivel');
  BAIRROS_BR=await r.json();
  return BAIRROS_BR;
}
"""
if "let BAIRROS_BR=null;" not in e:
    e = re.sub(r"const JOINVILLE_BAIRROS=\[.*?\];\n", lambda _m: geo_js, e, count=1, flags=re.S)

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
    }catch(err){ console.warn(err); }
    bairros=[...new Set([...bairros,...conhecidos])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    opts('#bairro',['Todos os bairros',...bairros],'Todos os bairros');
  } finally { $('#bairro').disabled=false; }
}
async function build(){"""
e, n = re.subn(r"async function atualizarBairros\(\)\{.*?\n\}\nasync function build\(\)\{", lambda _m: novo_bairros, e, count=1, flags=re.S)
if n != 1 and "carregarBaseBairros" not in e:
    raise SystemExit("funcao atualizarBairros nao encontrada")
mods["extrator"] = b64(e)

# --- Novo modulo Extrator Instagram ---
instagram_html = r'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Extrator de Instagram</title>
<style>
:root{--r:#5B4FE9;--t:#17182b;--s:#6b6f86;--l:#e5e7ef;--bg:#f6f7fb;--ok:#13a567}
*{box-sizing:border-box}body{margin:0;font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--t)}
.wrap{max-width:1380px;margin:auto;padding:28px 24px 56px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
h1{margin:0;font-size:32px}.sub{color:var(--s);margin-top:5px}.tabs{display:flex;gap:6px;margin:12px 0}.tab{border:1px solid var(--l);background:white;padding:10px 18px;border-radius:10px;font-weight:700}.tab.on{color:var(--r);border-color:#cfc9ff;background:#f5f3ff}
.card{background:white;border:1px solid var(--l);border-radius:14px;padding:18px;margin-bottom:14px}.objetivos{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.obj{border:1px solid var(--l);border-radius:12px;padding:14px}.obj.on{border-color:var(--r);box-shadow:0 0 0 2px #eeeaff}.obj b{display:block}.obj small{color:var(--s)}
.grid{display:grid;grid-template-columns:1.1fr .65fr 1.15fr 1.1fr;gap:10px;margin-top:14px}.grid2{display:grid;grid-template-columns:1.2fr .8fr .55fr;gap:10px;margin-top:10px}.campo label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}
input,select{width:100%;border:1.5px solid var(--l);border-radius:10px;padding:11px 12px;background:white}.btn{border:0;border-radius:10px;padding:11px 18px;font-weight:800;cursor:pointer}.primary{background:var(--r);color:white}.line{background:white;border:1px solid var(--l)}
.progress{height:8px;background:#edf0f5;border-radius:99px;overflow:hidden}.bar{height:100%;width:0;background:var(--r);transition:.3s}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.stat{border-right:1px solid var(--l)}.stat:last-child{border-right:0}.stat b{font-size:24px}.stat small{display:block;color:var(--s)}
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.pill{padding:8px 12px;border-radius:999px;background:#f1f2f6;font-size:13px;font-weight:700}.pill.on{background:#eeeaff;color:var(--r)}
.table{overflow:auto}table{width:100%;border-collapse:collapse;min-width:980px;font-size:13px}th,td{padding:10px 8px;border-bottom:1px solid #eff0f4;text-align:left}th{font-size:11px;color:var(--s);text-transform:uppercase}
.badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#e6f7ef;color:#11734c;font-weight:700}.muted{color:var(--s)}a{color:var(--r);font-weight:700;text-decoration:none}
.notice{padding:12px;border-radius:10px;background:#fff8df;border:1px solid #f2dd89;color:#6c5600;font-size:13px;margin-top:10px}
@media(max-width:900px){.objetivos,.grid,.grid2,.stats{grid-template-columns:1fr 1fr}}@media(max-width:560px){.objetivos,.grid,.grid2,.stats{grid-template-columns:1fr}.wrap{padding:18px 12px}}
</style></head><body>
<div class="wrap">
<div class="top"><div><h1>Extrator de Instagram</h1><div class="sub">Encontre novos negócios e organize oportunidades a partir de perfis públicos.</div></div><button class="btn line" id="ajuda">Como funciona?</button></div>
<div class="tabs"><button class="tab on">Buscar</button><button class="tab">Meus leads</button><button class="tab">Campanhas</button></div>
<section class="card">
<b>Objetivo da busca</b>
<div class="objetivos">
<div class="obj on"><b>Encontrar novos negócios</b><small>Perfis comerciais na sua região</small></div>
<div class="obj"><b>Encontrar perfis por nicho</b><small>Salões, clínicas, restaurantes...</small></div>
<div class="obj"><b>Encontrar perfis por cidade</b><small>Todos os perfis da cidade</small></div>
<div class="obj"><b>Encontrar por palavra-chave</b><small>Termos específicos</small></div>
</div>
<div class="grid">
<div class="campo"><label>Nicho</label><select id="nicho"><option>Salão de beleza</option><option>Barbearia</option><option>Clínica de estética</option><option>Pet shop</option><option>Academia</option></select></div>
<div class="campo"><label>Estado</label><select id="uf"><option>SC</option><option>SP</option><option>PR</option><option>RS</option><option>MG</option><option>RJ</option></select></div>
<div class="campo"><label>Cidade</label><input id="cidade" value="Florianópolis"></div>
<div class="campo"><label>Bairro (opcional)</label><input id="bairro" placeholder="Todos os bairros"></div>
</div>
<div class="grid2">
<div class="campo"><label>Palavra-chave (opcional)</label><input id="kw" placeholder="Ex.: cabelo, estética, maquiagem..."></div>
<div class="campo"><label>Quantidade máxima de perfis</label><input id="limite" type="number" min="1" max="500" value="100"></div>
<div style="display:flex;align-items:end"><button class="btn primary" id="buscar" style="width:100%">Buscar perfis</button></div>
</div>
<div id="msg" class="notice">As buscas são processadas pelo GitHub Actions e os resultados ficam salvos no Portal.</div>
</section>
<section class="card" id="andamento" style="display:none">
<div style="display:flex;justify-content:space-between;gap:10px"><div><b>Buscando perfis no Instagram...</b><div class="muted" id="desc"></div></div><button class="btn line" id="parar">Parar busca</button></div>
<div class="progress" style="margin-top:14px"><div class="bar" id="bar"></div></div>
<div class="stats"><div class="stat"><b id="s1">0</b><small>Perfis buscados</small></div><div class="stat"><b id="s2">0</b><small>Perfis encontrados</small></div><div class="stat"><b id="s3">0</b><small>Perfis analisados</small></div><div class="stat"><b id="s4">0</b><small>Com contato</small></div></div>
</section>
<section class="card">
<div class="tools"><span class="pill on">Resultados</span><span class="pill">Com contato</span><span class="pill">Novos</span><span class="pill">Conhecidos</span><span style="flex:1"></span><button class="btn line" id="csv">Exportar CSV</button></div>
<div class="table"><table><thead><tr><th>Status</th><th>Perfil</th><th>Nome</th><th>Seguidores</th><th>Tipo</th><th>Contato</th><th>Cidade</th><th>Última publicação</th><th>Ação</th></tr></thead><tbody id="tbody"><tr><td colspan="9" class="muted">Nenhuma busca executada ainda.</td></tr></tbody></table></div>
</section>
</div>
<script>
const $=s=>document.querySelector(s);let dados=[];
const DATA_URL='instagram-data/latest.json';
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
function parentFn(n){try{return typeof parent[n]==='function'?parent[n]:null}catch{return null}}
async function lerBase(){
 const r=await fetch(DATA_URL+'?t='+Date.now(),{cache:'no-store'});
 if(!r.ok) throw new Error('Base do Instagram ainda não foi publicada.');
 return r.json();
}
function mesmaBusca(q,b){
 return norm(q?.nicho)===norm(b.nicho)&&norm(q?.uf)===norm(b.uf)&&norm(q?.cidade)===norm(b.cidade)&&norm(q?.bairro)===norm(b.bairro)&&norm(q?.palavra_chave)===norm(b.palavra_chave);
}
function render(body,run){
 dados=Array.isArray(run?.results)?run.results:[];
 $('#bar').style.width='100%';
 $('#s1').textContent=body.limite;
 $('#s2').textContent=dados.length;
 $('#s3').textContent=dados.length;
 $('#s4').textContent=dados.filter(x=>x.whatsapp||x.phone||x.email||x.website).length;
 $('#tbody').innerHTML=dados.length?dados.map(x=>'<tr><td><span class="badge">'+((run?.new_usernames||[]).some(u=>norm(u)===norm(x.username))?'Novo':'Conhecido')+'</span></td><td>@'+(x.username||'—')+'</td><td>'+esc(x.name||'—')+'</td><td>'+(x.followers??'—')+'</td><td>'+(x.type||'—')+'</td><td>'+(x.whatsapp||x.phone||x.email||x.website||'—')+'</td><td>'+esc(x.city||body.cidade)+'</td><td>'+(x.last_post||'—')+'</td><td>'+(x.profile_url?'<a target="_blank" rel="noopener" href="'+x.profile_url+'">Ver perfil</a>':'—')+'</td></tr>').join(''):'<tr><td colspan="9" class="muted">Nenhum perfil encontrado para esta busca.</td></tr>';
}
$('#buscar').onclick=async()=>{
 const body={nicho:$('#nicho').value,uf:$('#uf').value,cidade:$('#cidade').value.trim(),bairro:$('#bairro').value.trim(),palavra_chave:$('#kw').value.trim(),limite:Number($('#limite').value)||100};
 const solicitar=parentFn('portalSolicitarInstagram');
 if(!solicitar){$('#msg').textContent='Atualize o Portal para iniciar buscas pelo GitHub.';return}
 $('#andamento').style.display='block';$('#desc').textContent=body.nicho+' em '+body.cidade+'/'+body.uf;$('#bar').style.width='10%';
 $('#msg').textContent='Solicitando coleta ao GitHub...';
 try{
   const before=Date.now();
   await solicitar(body);
   $('#msg').textContent='Busca enviada. O GitHub está coletando os perfis; esta tela atualizará automaticamente.';
   let tries=0;
   const poll=async()=>{
     tries++;
     try{
       const base=await lerBase();
       const run=(base.runs||[]).find(r=>mesmaBusca(r.query,body));
       const done=run&&Date.parse(run.finished_at||0)>=before-5000;
       if(done){render(body,run);$('#msg').textContent='Busca concluída: '+dados.length+' perfil(is) encontrado(s).';return}
     }catch{}
     $('#bar').style.width=Math.min(90,10+tries*4)+'%';
     if(tries<30) setTimeout(poll,10000); else $('#msg').textContent='A coleta ainda está processando no GitHub. Você pode voltar em alguns minutos; os resultados ficarão salvos.';
   };
   setTimeout(poll,6000);
 }catch(e){$('#msg').textContent='Não foi possível iniciar a coleta: '+e.message}
};
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
$('#csv').onclick=()=>{if(!dados.length)return;const h=['username','name','followers','type','whatsapp','phone','email','website','city','profile_url'];const txt=[h,...dados.map(x=>h.map(k=>x[k]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download='instagram-leads.csv';a.click();URL.revokeObjectURL(a.href)}
</script></body></html>'''
mods["instagram"] = b64(instagram_html)

# Atualiza JSON embutido
html = html[:m.start(2)] + json.dumps(mods, separators=(",",":")) + html[m.end(2):]

# Adiciona modulo ao menu principal, se ainda nao existir
if "id: 'instagram'" not in html:
    alvo = "{ id: 'extrator', arquivo: 'extrator-leads.html', nome: 'Extrator de Leads', desc: 'Encontre novos estabelecimentos por nicho e região, sem repetir leads já extraídos.', cor: '#7C3AED' },"
    novo = alvo + "\n    { id: 'instagram', arquivo: 'extrator-instagram.html', nome: 'Extrator de Instagram', desc: 'Encontre perfis comerciais públicos por nicho e região e organize novos leads.', cor: '#E1306C' },"
    if alvo not in html:
        raise SystemExit("config do modulo extrator nao encontrada")
    html = html.replace(alvo, novo, 1)

INDEX.write_text(html, encoding="utf-8")

# Libera o novo modulo para usuarios existentes
if USERS.exists():
    users = json.loads(USERS.read_text(encoding="utf-8"))
    lista = users if isinstance(users, list) else users.get("usuarios", [])
    for u in lista:
        mods_u = u.setdefault("modulos", [])
        if isinstance(mods_u, list) and "instagram" not in mods_u:
            mods_u.append("instagram")
    USERS.write_text(json.dumps(users, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Portal atualizado: bairros nacionais + Extrator de Instagram")
