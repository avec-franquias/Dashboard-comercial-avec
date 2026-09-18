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

novo_bairros = """async function bairrosOSM(nome,uf){
  const cacheKey='portal-bairros-osm:v2:'+uf+':'+chaveGeo(nome);
  try{
    const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
    if(cached&&Array.isArray(cached.bairros)&&Date.now()-Number(cached.ts||0)<30*86400000) return cached.bairros;
  }catch{}
  try{
    const q=new URLSearchParams({city:nome,state:uf,country:'Brazil',format:'jsonv2',limit:'3',addressdetails:'1'});
    const nr=await fetch('https://nominatim.openstreetmap.org/search?'+q.toString(),{headers:{'Accept-Language':'pt-BR'}});
    if(!nr.ok) return [];
    const nj=await nr.json();
    const p=(nj||[]).find(x=>String(x?.address?.country_code||'').toLowerCase()==='br')||(nj||[])[0];
    if(!p) return [];
    const id=Number(p.osm_id); if(!id) return [];
    const areaId=p.osm_type==='relation'?3600000000+id:p.osm_type==='way'?2400000000+id:null;
    if(!areaId) return [];
    const over='[out:json][timeout:25];area('+areaId+')->.a;(nwr["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.a);nwr["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a););out tags;';
    const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
    for(const endpoint of endpoints){
      try{
        const or=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(over)});
        if(!or.ok) continue;
        const oj=await or.json();
        const bairros=[...new Set((oj.elements||[]).map(x=>x.tags?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
        if(bairros.length){
          localStorage.setItem(cacheKey,JSON.stringify({ts:Date.now(),bairros}));
          return bairros;
        }
      }catch(err){console.warn('Fallback de bairros:',endpoint,err)}
    }
    return [];
  }catch(err){console.warn('Bairros OSM:',err);return []}
}
async function atualizarBairros(){
  const cidade=$('#cidade').value;
  $('#bairro').disabled=true;
  opts('#bairro',['Carregando bairros...'],'Carregando bairros...');
  try{
    const partes=String(cidade||'').split(',');
    const ufCidade=partes.length>1?String(partes.pop()||'').trim().toUpperCase():'';
    const uf=String($('#estado').value||ufCidade||'').trim().toUpperCase();
    const nome=partes.join(',').trim()||String(cidade||'').replace(/,\s*[A-Z]{2}$/,'').trim();
    const conhecidos=(DATA.runs||[])
      .filter(r=>norm(r.query?.cidade)===norm(cidade))
      .map(r=>r.query?.bairro).filter(Boolean);
    let locais=[],osm=[];
    try{
      const base=await carregarBaseBairros();
      locais=base?.[uf]?.[chaveGeo(nome)]||[];
    }catch(err){ console.warn('Base local de bairros:',err); }
    try{
      osm=await bairrosOSM(nome,uf);
    }catch(err){ console.warn('Base complementar de bairros:',err); }
    const bairros=[...new Set([...locais,...osm,...conhecidos])]
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    opts('#bairro',['Todos os bairros',...bairros],'Todos os bairros');
  } finally { $('#bairro').disabled=false; }
}
async function build(){"""
e, n = re.subn(r"async function atualizarBairros\(\)\{.*?\n\}\nasync function build\(\)\{", lambda _m: novo_bairros, e, count=1, flags=re.S)
if n != 1 and "carregarBaseBairros" not in e:
    raise SystemExit("funcao atualizarBairros nao encontrada")
mods["extrator"] = b64(e)

# --- Migrador: fluxo simples somente para Clientes + limpar/nova migracao ---
mig = base64.b64decode(mods["migrador"]).decode("utf-8")
mig = re.sub(
    r'<label class="section-label">Tipo de cadastro</label>\s*<div class="types" id="types">.*?</div>\s*\n\s*<div class="field">',
    '<div class="notice" style="margin-top:0"><b>Importação de clientes</b><br>Envie uma planilha de clientes. Para migrar outro arquivo, finalize esta importação e clique em <b>Nova migração</b>.</div>\\n\\n    <div class="field">',
    mig, count=1, flags=re.S
)
mig = mig.replace(
    '<div class="actions"><button class="btn secondary" id="back2">Ajustar mapeamento</button><button class="btn" id="downloadBtn">Gerar planilha AVEC (.xlsx)</button><button class="btn secondary" id="reviewBtn">Baixar relatório de revisão</button></div>',
    '<div class="actions"><button class="btn secondary" id="back2">Ajustar mapeamento</button><button class="btn" id="downloadBtn">Gerar planilha AVEC (.xlsx)</button><button class="btn secondary" id="reviewBtn">Baixar relatório de revisão</button><button class="btn secondary" id="newMigrationBtn">Limpar e fazer nova migração</button></div>'
)
mig = re.sub(r"\$\('#types'\)\.onclick=e=>\{.*?\};const drop=", "const drop=", mig, count=1)
mig = mig.replace(
    "$('#downloadBtn').onclick=downloadTemplate;$('#reviewBtn').onclick=downloadReview;",
    """$('#downloadBtn').onclick=downloadTemplate;$('#reviewBtn').onclick=downloadReview;
function novaMigracao(){
  tipo='clientes';file=null;rawHeaders=[];rawRows=[];mapping={};processed=[];duplicates=0;
  inp.value='';$('#salao').value='';$('#fileName').textContent='';$('#fileInfo').classList.remove('show');
  $('#readBtn').disabled=true;$('#mapping').innerHTML='';$('#thead').innerHTML='';$('#tbody').innerHTML='';
  $('#status').className='status';$('#status').textContent='';$('#status2').className='status';$('#status2').textContent='';
  $('#mapCard').classList.add('hidden');$('#resultCard').classList.add('hidden');$('#uploadCard').classList.remove('hidden');
  ['stTotal','stReady','stReview','stDup'].forEach(id=>$('#'+id).textContent='0');
  $('#resultNote').textContent='';setStep(1);window.scrollTo({top:0,behavior:'smooth'});
}
$('#newMigrationBtn').onclick=novaMigracao;"""
)
mods["migrador"] = b64(mig)

# --- Novo modulo Clientes: cruza Receita SaaS + Contratos localmente no navegador ---
clientes_html = r'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clientes</title>
<style>
:root{--p:#5B4FE9;--pd:#4738d4;--bg:#f6f7fb;--card:#fff;--line:#e4e6ef;--text:#17182b;--muted:#686c83;--ok:#069669;--bad:#e43b43;--warn:#d97706}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1460px;margin:auto;padding:30px 28px 60px}
.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.top h1{font-size:32px;margin:0 0 6px}.sub{color:var(--muted)}
.btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 16px;font-weight:800;cursor:pointer}.btn.primary{background:var(--p);border-color:var(--p);color:#fff}.btn:hover{border-color:var(--p)}.btn:disabled{opacity:.5;cursor:not-allowed}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}.metric small,.opp small{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b90a6;font-weight:800}.metric b{display:block;font-size:24px;margin-top:7px}.metric.ok b{color:var(--ok)}.metric.bad b{color:var(--bad)}
.section-title{display:flex;align-items:baseline;gap:8px;margin:14px 0 10px}.section-title b{font-size:17px}.section-title span{font-size:12px;color:var(--muted)}
.opps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.opp{cursor:pointer;border-color:#cce9df}.opp b{display:block;color:var(--ok);font-size:22px;margin:8px 0 4px}.opp span{font-size:12px;color:var(--muted)}.opp.on{box-shadow:0 0 0 2px #bde7d8}
.toolbar{display:grid;grid-template-columns:1.7fr .7fr .7fr auto;gap:10px;margin:18px 0 10px}.input,select{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;background:#fff}
.meta{display:flex;justify-content:space-between;align-items:center;color:#9095a8;font-size:12px;margin:14px 0 7px}.table{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:auto}table{border-collapse:collapse;width:100%;min-width:900px}th,td{padding:12px 14px;border-bottom:1px solid #eff0f4;text-align:left;font-size:13px}th{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#6c7189;background:#fbfbfd;position:sticky;top:0}.name{font-weight:800}.small{font-size:11px;color:var(--muted);margin-top:4px}.status{display:inline-block;border-radius:6px;padding:4px 7px;font-size:11px;font-weight:800}.status.active{background:#e7f7f1;color:#087b59}.status.churn{background:#fdecef;color:#c52f39}.tag{display:inline-block;margin:2px 4px 2px 0;padding:4px 7px;border-radius:6px;background:#eef7f4;color:#18725c;font-size:10px;font-weight:700}.money{font-weight:800;color:var(--ok);white-space:nowrap}
.empty{text-align:center;padding:50px 20px;color:var(--muted)}.notice{padding:12px 14px;border:1px solid #f1db94;background:#fff8df;color:#6d5600;border-radius:10px;margin:10px 0;font-size:13px}
.modalBg{position:fixed;inset:0;background:rgba(17,20,38,.45);display:grid;place-items:center;padding:20px;z-index:10}.modal{width:min(640px,100%);background:white;border-radius:16px;padding:22px;box-shadow:0 25px 70px rgba(0,0,0,.2)}.modal h2{margin:0 0 6px}.field{margin:16px 0}.field label{display:block;font-weight:800;font-size:13px;margin-bottom:6px}.filebox{border:1px dashed #bfc3d3;border-radius:12px;padding:14px;background:#fafafd}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.hidden{display:none!important}
@media(max-width:1000px){.cards,.opps{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr 1fr}}@media(max-width:600px){.cards,.opps,.toolbar{grid-template-columns:1fr}.wrap{padding:18px 12px}.top{flex-direction:column}}
</style></head><body><div class="wrap">
<div class="top"><div><h1>Clientes</h1><div class="sub">Carteira consolidada a partir dos relatórios Receita SaaS e Contratos/Componentes.</div></div><button class="btn primary" id="update">Atualizar base</button></div>

<div class="cards">
<div class="card metric"><small>Total clientes</small><b id="mTotal">0</b></div>
<div class="card metric ok"><small>Ativos</small><b id="mAtivos">0</b></div>
<div class="card metric bad"><small>Cancelados</small><b id="mChurn">0</b></div>
<div class="card metric ok"><small>MRR total</small><b id="mMrr">R$0,00</b></div>
</div>

<div class="section-title"><b>💡 Oportunidades na sua carteira</b><span>clientes ativos que ainda não têm cada produto — clique para filtrar</span></div>
<div class="opps">
<div class="card opp" data-opp="agendamento"><small>Sem IA Agendamento</small><b id="oAg">0</b><span id="oAgVal">Potencial R$0/mês</span></div>
<div class="card opp" data-opp="marketing"><small>Sem IA Marketing</small><b id="oMk">0</b><span id="oMkVal">Potencial R$0/mês</span></div>
<div class="card opp" data-opp="confirmacao"><small>Sem IA Confirmação</small><b id="oCf">0</b><span id="oCfVal">Potencial R$0/mês</span></div>
<div class="card opp" data-opp="nfce"><small>Sem NFC-e</small><b id="oNf">0</b><span id="oNfVal">Potencial R$0/mês</span></div>
</div>

<div id="notice" class="notice">Importe os dois relatórios para montar sua carteira. Os dados ficam somente neste navegador.</div>

<div class="toolbar">
<input id="search" class="input" placeholder="Buscar por nome, ID ou documento...">
<select id="statusFilter"><option value="">Todos os clientes</option><option value="ATIVO">Ativos</option><option value="CHURN">Cancelados</option></select>
<select id="sort"><option value="name">Nome (A–Z)</option><option value="mrr">Maior MRR</option><option value="id">ID</option></select>
<button class="btn" id="clearOpp">Limpar filtro</button>
</div>
<div class="meta"><span id="count">0 clientes</span><span id="updated"></span></div>
<div class="table"><table><thead><tr><th>Cliente</th><th>Status</th><th>Produtos</th><th>MRR</th></tr></thead><tbody id="tbody"><tr><td colspan="4" class="empty">Importe os relatórios para começar.</td></tr></tbody></table></div>
</div>

<div id="modal" class="modalBg hidden"><div class="modal">
<h2>Atualizar base de clientes</h2><div class="sub">Selecione os dois relatórios exportados. O cruzamento é feito pelo Cliente ID.</div>
<div class="field"><label>1. Receita SaaS</label><div class="filebox"><input id="fReceita" type="file" accept=".csv,text/csv"></div></div>
<div class="field"><label>2. Contratos e Componentes</label><div class="filebox"><input id="fComp" type="file" accept=".csv,text/csv"></div></div>
<div id="importMsg" class="notice hidden"></div>
<div class="actions"><button class="btn" id="cancel">Cancelar</button><button class="btn primary" id="import">Importar e atualizar</button></div>
</div></div>

<script>
const $=s=>document.querySelector(s);let BASE=[],oppFilter='';
const KEY='portal-clientes-v1';
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function parseMoney(v){if(typeof v==='number')return v;let s=String(v??'').trim();if(!s)return 0;s=s.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(s)||0}
function parseCSV(text){
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
  if(c==='"'){if(q&&n==='"'){cell+='"';i++}else q=!q}
  else if(c===','&&!q){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row)}
 const h=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim());
 return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
function porteFrom(text){
 const s=norm(text);const m=s.match(/ate\s*(\d+)\s*prof/);if(m){const n=+m[1];if(n<=2)return'ate2';if(n<=5)return'ate5';if(n<=10)return'ate10';if(n<=20)return'ate20';if(n<=30)return'ate30';if(n<=40)return'ate40';if(n<=50)return'ate50'}return'ilimitado'
}
const PRICES={
 agendamento:{ate2:150,ate5:240,ate10:260,ate20:420,ate30:540,ate40:780,ate50:899,ilimitado:720},
 marketing:{ate2:100,ate5:170,ate10:320,ate20:330,ate30:420,ate40:570,ate50:660,ilimitado:1020},
 confirmacao:{ate2:75,ate5:150,ate10:240,ate20:299,ate30:360,ate40:480,ate50:540,ilimitado:599},
 nfce:{ate2:114.9,ate5:114.9,ate10:114.9,ate20:114.9,ate30:114.9,ate40:114.9,ate50:114.9,ilimitado:114.9}
};
function has(c,k){const arr=c.produtos||[];if(k==='agendamento')return arr.some(x=>/AVECIA.*AGENDAMENTO/i.test(x));if(k==='marketing')return arr.some(x=>/AVECIA.*MARKETING/i.test(x));if(k==='confirmacao')return arr.some(x=>/AVECIA.*CONFIRMA/i.test(x));if(k==='nfce')return arr.some(x=>/NFC-E/i.test(x));return false}
function save(){localStorage.setItem(KEY,JSON.stringify({updated:new Date().toISOString(),clientes:BASE}))}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.clientes){BASE=x.clientes;$('#updated').textContent='Atualizado '+new Date(x.updated).toLocaleString('pt-BR')}}catch{}render()}
function rebuild(receita,comp){
 const cm=new Map();
 for(const r of comp){const id=String(r['Cliente ID']||'').trim();if(!id)continue;let x=cm.get(id)||{produtos:[],contratos:[],porte:'ilimitado'};const prod=String(r['Nome Componente']||'').trim();if(prod&&!x.produtos.includes(prod))x.produtos.push(prod);const ct=String(r['Nome Contrato']||'').trim();if(ct&&!x.contratos.includes(ct))x.contratos.push(ct);if(/PLATAFORMA AVEC/i.test(ct))x.porte=porteFrom(ct);cm.set(id,x)}
 BASE=receita.map(r=>{const id=String(r['Cliente ID']||'').trim(),c=cm.get(id)||{produtos:[],contratos:[],porte:'ilimitado'};return{id,nome:String(r['Nome']||'').trim(),documento:String(r['Documento']||'').replace(/\.0$/,''),status:String(r['Status']||'').trim().toUpperCase(),statusContrato:String(r['Status Contrato']||'').trim(),mrr:parseMoney(r['MRR (R$)']),ativacao:String(r['Ativacao Contrato']||''),expiracao:String(r['Expiracao Contrato']||''),churn:String(r['Data Churn']||''),...c}});
 save();render();
}
function render(){
 const total=BASE.length,ativos=BASE.filter(x=>x.status==='ATIVO'),churn=BASE.filter(x=>x.status==='CHURN');
 $('#mTotal').textContent=total;$('#mAtivos').textContent=ativos.length;$('#mChurn').textContent=churn.length;$('#mMrr').textContent=money(ativos.reduce((a,x)=>a+x.mrr,0));
 for(const [k,id,valId] of [['agendamento','oAg','oAgVal'],['marketing','oMk','oMkVal'],['confirmacao','oCf','oCfVal'],['nfce','oNf','oNfVal']]){
   const miss=ativos.filter(x=>!has(x,k));$('#'+id).textContent=miss.length;const pot=miss.reduce((a,x)=>a+(PRICES[k][x.porte]||PRICES[k].ilimitado),0);$('#'+valId).textContent='Potencial '+money(pot)+'/mês';
 }
 let list=[...BASE],q=norm($('#search').value),st=$('#statusFilter').value;
 if(q)list=list.filter(x=>norm(x.nome).includes(q)||norm(x.id).includes(q)||norm(x.documento).includes(q));
 if(st)list=list.filter(x=>x.status===st);if(oppFilter)list=list.filter(x=>x.status==='ATIVO'&&!has(x,oppFilter));
 const sort=$('#sort').value;if(sort==='mrr')list.sort((a,b)=>b.mrr-a.mrr);else if(sort==='id')list.sort((a,b)=>Number(a.id)-Number(b.id));else list.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 $('#count').textContent=list.length+' clientes';
 $('#tbody').innerHTML=list.length?list.map(x=>'<tr><td><div class="name">'+esc(x.nome||'—')+'</div><div class="small">ID '+esc(x.id)+(x.documento?' · '+esc(x.documento):'')+(x.expiracao?' · exp '+esc(x.expiracao):'')+'</div></td><td><span class="status '+(x.status==='ATIVO'?'active':'churn')+'">'+(x.status==='ATIVO'?'Ativo':'Cancelado')+'</span></td><td>'+(x.produtos.length?x.produtos.map(p=>'<span class="tag">'+esc(shortProd(p))+'</span>').join(''):'<span class="small">sem produto</span>')+'</td><td class="money">'+money(x.mrr)+'</td></tr>').join(''):'<tr><td colspan="4" class="empty">Nenhum cliente encontrado.</td></tr>';
 $('#notice').textContent=BASE.length?'Base carregada neste navegador. Use “Atualizar base” quando receber relatórios novos.':'Importe os dois relatórios para montar sua carteira. Os dados ficam somente neste navegador.';
}
function shortProd(p){return p.replace('PLATAFORMA AVEC - ASSINATURA','Plataforma AVEC').replace(/AVECIA - /,'IA ').replace(/ - ATÉ .* MENSAL/i,'').replace('MÓDULO ','')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
$('#update').onclick=()=>$('#modal').classList.remove('hidden');$('#cancel').onclick=()=>$('#modal').classList.add('hidden');
$('#import').onclick=async()=>{const a=$('#fReceita').files[0],b=$('#fComp').files[0],msg=$('#importMsg');msg.classList.remove('hidden');if(!a||!b){msg.textContent='Selecione os dois relatórios.';return}try{msg.textContent='Lendo e cruzando os relatórios...';const [ta,tb]=await Promise.all([a.text(),b.text()]);const ra=parseCSV(ta),cb=parseCSV(tb);if(!ra.length||!cb.length)throw new Error('Um dos arquivos está vazio.');if(!('Cliente ID' in ra[0])||!('MRR (R$)' in ra[0]))throw new Error('O primeiro arquivo não parece ser o relatório Receita SaaS.');if(!('Cliente ID' in cb[0])||!('Nome Componente' in cb[0]))throw new Error('O segundo arquivo não parece ser Contratos e Componentes.');rebuild(ra,cb);$('#modal').classList.add('hidden');$('#fReceita').value='';$('#fComp').value='';msg.classList.add('hidden')}catch(e){msg.textContent='Erro: '+e.message}};
['search','statusFilter','sort'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));
document.querySelectorAll('.opp').forEach(el=>el.onclick=()=>{oppFilter=oppFilter===el.dataset.opp?'':el.dataset.opp;document.querySelectorAll('.opp').forEach(x=>x.classList.toggle('on',x.dataset.opp===oppFilter));render()});
$('#clearOpp').onclick=()=>{oppFilter='';document.querySelectorAll('.opp').forEach(x=>x.classList.remove('on'));render()};
load();
</script></body></html>'''
mods["clientes"] = b64(clientes_html)

# Adiciona Clientes ao menu, antes do Migrador.
if "id: 'clientes'" not in html:
    alvo_clientes = "{ id: 'migrador', arquivo: 'migrador-planilhas.html', nome: 'Migrador de Planilhas', desc: 'Converta planilhas de clientes, produtos, serviços e profissionais para o formato AVEC.', cor: '#6C47FF' },"
    novo_clientes = "{ id: 'clientes', arquivo: 'clientes.html', nome: 'Clientes', desc: 'Carteira consolidada, MRR, produtos contratados e oportunidades por cliente.', cor: '#059669' },\n    " + alvo_clientes
    if alvo_clientes in html:
        html = html.replace(alvo_clientes, novo_clientes, 1)

# Libera Clientes para usuarios existentes.

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
<div class="tabs"><button class="tab on" data-view="buscar">Buscar</button><button class="tab" data-view="leads">Meus leads</button></div>
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
<div class="campo"><label>Estado</label><select id="uf"></select></div>
<div class="campo"><label>Cidade</label><select id="cidade"></select></div>
<div class="campo"><label>Bairro (opcional)</label><select id="bairro"><option value="">Todos os bairros</option></select></div>
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
<div class="tools"><button class="pill on" data-filter="todos">Resultados</button><button class="pill" data-filter="contato">Com contato</button><button class="pill" data-filter="novos">Novos</button><button class="pill" data-filter="conhecidos">Conhecidos</button><span style="flex:1"></span><button class="btn line" id="csv">Exportar CSV</button></div>
<div class="table"><table><thead><tr><th>Status</th><th>Perfil</th><th>Nome</th><th>Seguidores</th><th>Tipo</th><th>Contato</th><th>Cidade</th><th>Última publicação</th><th>Ação</th></tr></thead><tbody id="tbody"><tr><td colspan="9" class="muted">Nenhuma busca executada ainda.</td></tr></tbody></table></div>
</section>
</div>
<script>
const $=s=>document.querySelector(s);let dados=[];
const DATA_URL='instagram-data/latest.json';
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
function parentFn(n){try{return typeof parent[n]==='function'?parent[n]:null}catch{return null}}
const ESTADOS=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
let MUNICIPIOS=[],BAIRROS=null,parado=false,ultimoRun=null,filtro='todos';
const geoKey=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
function fill(el,vals,sel=''){el.innerHTML=vals.map(v=>{const value=Array.isArray(v)?v[0]:v,label=Array.isArray(v)?v[1]:v;return '<option value="'+esc(value)+'" '+(norm(value)===norm(sel)?'selected':'')+'>'+esc(label)+'</option>'}).join('')}
async function carregarCidadesIG(){
 const uf=$('#uf').value; let cidades=[];
 try{
   if(!MUNICIPIOS.length){const r=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',{cache:'force-cache'});if(r.ok)MUNICIPIOS=await r.json()}
   cidades=MUNICIPIOS.map(x=>{const sigla=x['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla||x.microrregiao?.mesorregiao?.UF?.sigla||'';return sigla===uf?x.nome:''}).filter(Boolean)
 }catch{}
 if(!cidades.length&&uf==='SC')cidades=['Florianópolis','Joinville'];
 fill($('#cidade'),cidades,cidades.includes('Florianópolis')?'Florianópolis':cidades[0]); await carregarBairrosIG();
}
async function carregarBairrosIG(){
 const uf=$('#uf').value,cidade=$('#cidade').value; let bairros=[];
 $('#bairro').disabled=true;fill($('#bairro'),[['','Carregando bairros...']],'');
 try{
   if(!BAIRROS){const r=await fetch('geo/bairros-br.json?ts=20260918',{cache:'force-cache'});if(r.ok)BAIRROS=await r.json()}
   bairros=BAIRROS?.[uf]?.[geoKey(cidade)]||[];
 }catch{}
 fill($('#bairro'),[['','Todos os bairros'],...bairros.map(x=>[x,x])],'');$('#bairro').disabled=false;
}
function bodyAtual(){return {nicho:$('#nicho').value,uf:$('#uf').value,cidade:$('#cidade').value,bairro:$('#bairro').value,palavra_chave:$('#kw').value.trim(),limite:Number($('#limite').value)||100}}
function aplicarFiltro(){
 if(!ultimoRun)return;
 const all=Array.isArray(ultimoRun.results)?ultimoRun.results:[],newSet=new Set(ultimoRun.new_usernames||[]);
 let view=all;
 if(filtro==='contato')view=all.filter(x=>x.whatsapp||x.phone||x.email||x.website);
 if(filtro==='novos')view=all.filter(x=>newSet.has(x.username));
 if(filtro==='conhecidos')view=all.filter(x=>!newSet.has(x.username));
 const original=ultimoRun.results;ultimoRun.results=view;render(bodyAtual(),ultimoRun);ultimoRun.results=original;
}
async function carregarResultadoAtual(){
 try{
   const base=await lerBase(),body=bodyAtual();
   const run=(base.runs||[]).find(r=>mesmaBusca(r.query,body));
   if(run){ultimoRun=run;render(body,run);$('#andamento').style.display='block';$('#msg').textContent='Última busca concluída: '+(run.total??run.results?.length??0)+' perfil(is).'}
 }catch{}
}
async function lerBase(){
 const r=await fetch(DATA_URL+'?t='+Date.now(),{cache:'no-store'});
 if(!r.ok) throw new Error('Base do Instagram ainda não foi publicada.');
 return r.json();
}
function mesmaBusca(q,b){
 return norm(q?.nicho)===norm(b.nicho)&&norm(q?.uf)===norm(b.uf)&&norm(q?.cidade)===norm(b.cidade)&&norm(q?.bairro)===norm(b.bairro)&&norm(q?.palavra_chave)===norm(b.palavra_chave);
}
function render(body,run){
 ultimoRun=run; dados=Array.isArray(run?.results)?run.results:[];
 $('#bar').style.width='100%';
 $('#s1').textContent=body.limite;
 $('#s2').textContent=dados.length;
 $('#s3').textContent=dados.length;
 $('#s4').textContent=dados.filter(x=>x.whatsapp||x.phone||x.email||x.website).length;
 $('#tbody').innerHTML=dados.length?dados.map(x=>'<tr><td><span class="badge">'+((run?.new_usernames||[]).some(u=>norm(u)===norm(x.username))?'Novo':'Conhecido')+'</span></td><td>@'+(x.username||'—')+'</td><td>'+esc(x.name||'—')+'</td><td>'+(x.followers??'—')+'</td><td>'+(x.type||'—')+'</td><td>'+(x.whatsapp||x.phone||x.email||x.website||'—')+'</td><td>'+esc(x.city||body.cidade)+'</td><td>'+(x.last_post||'—')+'</td><td>'+(x.profile_url?'<a target="_blank" rel="noopener" href="'+x.profile_url+'">Ver perfil</a>':'—')+'</td></tr>').join(''):'<tr><td colspan="9" class="muted">Nenhum perfil encontrado para esta busca.</td></tr>';
}
$('#buscar').onclick=async()=>{
 const body=bodyAtual(); parado=false; const botao=$('#buscar');botao.disabled=true;botao.textContent='Enviando...';
 const solicitar=parentFn('portalSolicitarInstagram');
 if(!solicitar){$('#msg').textContent='Atualize o Portal para iniciar buscas pelo GitHub.';return}
 $('#andamento').style.display='block';$('#desc').textContent=body.nicho+' em '+body.cidade+'/'+body.uf;$('#bar').style.width='10%';
 $('#msg').textContent='Solicitando coleta ao GitHub...';
 try{
   const before=Date.now();
   await solicitar(body);
   botao.textContent='Coletando...';$('#msg').textContent='Busca enviada. Aguardando o GitHub iniciar a coleta...';
   let tries=0;
   const poll=async()=>{
     if(parado){botao.disabled=false;botao.textContent='Buscar perfis';$('#msg').textContent='Acompanhamento interrompido. A coleta no GitHub pode continuar em segundo plano.';return}
     tries++;
     try{
       const base=await lerBase();
       const run=(base.runs||[]).find(r=>mesmaBusca(r.query,body));
       const done=run&&Date.parse(run.finished_at||0)>=before-5000;
       if(done){ultimoRun=run;render(body,run);$('#msg').textContent='Busca concluída: '+dados.length+' perfil(is) encontrado(s).';botao.disabled=false;botao.textContent='Buscar perfis';return}
     }catch{}
     $('#bar').style.width=Math.min(90,10+tries*4)+'%';
     if(tries<60) setTimeout(poll,10000); else {$('#msg').textContent='A coleta demorou mais que o esperado. Os resultados aparecerão em Meus leads quando o GitHub concluir.';botao.disabled=false;botao.textContent='Buscar perfis';}
   };
   setTimeout(poll,6000);
 }catch(e){$('#msg').textContent='Não foi possível iniciar a coleta: '+e.message;botao.disabled=false;botao.textContent='Buscar perfis'}
};
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
$('#parar').onclick=()=>{parado=true};
$('#ajuda').onclick=()=>alert('Escolha nicho e região, clique em Buscar perfis e aguarde a coleta pelo GitHub Actions. Os resultados ficam salvos e podem ser exportados em CSV.');
$('#uf').onchange=carregarCidadesIG;$('#cidade').onchange=carregarBairrosIG;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('on'));b.classList.add('on');filtro=b.dataset.filter;aplicarFiltro()});
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');if(b.dataset.view==='leads')carregarResultadoAtual(); });
(async()=>{fill($('#uf'),ESTADOS.map(([u,n])=>[u,u+' — '+n]),'SC');await carregarCidadesIG();await carregarResultadoAtual()})();
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

# Faz cada busca do Extrator disparar somente a consulta escolhida no GitHub Actions.
portal_dispatch = r"""window.portalSolicitarExtracao = async ({ nicho, cidade, bairro = '', max_results = 80 }) => {
  nicho = String(nicho || '').trim(); cidade = String(cidade || '').trim(); bairro = String(bairro || '').trim();
  if (!nicho || !cidade) throw new Error('Escolha o nicho e a cidade.');
  let g = ghCfg();
  if (!g) { await conectarGithub(); g = ghCfg(); }
  if (!g) throw new Error('Conecte o GitHub para iniciar uma nova coleta.');
  await gh(g, '/actions/workflows/update-leads.yml/dispatches', {
    method: 'POST',
    body: {
      ref: g.branch,
      inputs: {
        nicho,
        cidade,
        bairro,
        max_results: String(Math.max(1, Math.min(Number(max_results) || 80, 120)))
      }
    }
  });
  return { ok: true, direto: true };
};"""
html, qtd = re.subn(
    r"window\.portalSolicitarExtracao = async \(\{ nicho, cidade, bairro = '', max_results = 80 \}\) => \{.*?\n\};",
    lambda _m: portal_dispatch,
    html,
    count=1,
    flags=re.S
)
if qtd != 1:
    print("Aviso: funcao portalSolicitarExtracao nao foi substituida")

# Dispara a coleta de Instagram diretamente pelo workflow, sem servidor externo.
portal_instagram_dispatch = r"""window.portalSolicitarInstagram = async ({ nicho = '', uf = '', cidade = '', bairro = '', palavra_chave = '', limite = 100 }) => {
  nicho = String(nicho || '').trim(); uf = String(uf || '').trim().toUpperCase(); cidade = String(cidade || '').trim();
  bairro = String(bairro || '').trim(); palavra_chave = String(palavra_chave || '').trim();
  if (!nicho && !cidade && !palavra_chave) throw new Error('Informe nicho, cidade ou palavra-chave.');
  let g = ghCfg();
  if (!g) { await conectarGithub(); g = ghCfg(); }
  if (!g) throw new Error('Conecte o GitHub para iniciar uma nova coleta.');
  await gh(g, '/actions/workflows/update-instagram.yml/dispatches', {
    method: 'POST',
    body: {
      ref: g.branch,
      inputs: {
        nicho, uf, cidade, bairro, palavra_chave,
        limite: String(Math.max(1, Math.min(Number(limite) || 100, 200)))
      }
    }
  });
  return { ok: true, direto: true };
};"""
if "window.portalSolicitarInstagram" not in html:
    marker = "// ================= módulos dentro do portal ================="
    if marker in html:
        html = html.replace(marker, portal_instagram_dispatch + "\n\n" + marker, 1)
    else:
        pos = html.rfind("</script>")
        if pos < 0:
            raise SystemExit("script principal nao encontrado para Instagram")
        html = html[:pos] + "\n" + portal_instagram_dispatch + "\n" + html[pos:]

INDEX.write_text(html, encoding="utf-8")

# Libera o novo modulo para usuarios existentes
if USERS.exists():
    users = json.loads(USERS.read_text(encoding="utf-8"))
    lista = users if isinstance(users, list) else users.get("usuarios", [])
    for u in lista:
        mods_u = u.setdefault("modulos", [])
        if isinstance(mods_u, list):
            if "instagram" not in mods_u:
                mods_u.append("instagram")
            if "clientes" not in mods_u:
                mods_u.append("clientes")
    USERS.write_text(json.dumps(users, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Portal atualizado: bairros nacionais + Extrator de Instagram")
