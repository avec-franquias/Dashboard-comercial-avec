import json, re, base64
from pathlib import Path

p=Path("index.html")
html=p.read_text(encoding="utf-8")
m=re.search(r'(<script[^>]+id="modulosEmbutidos"[^>]*>)(.*?)(</script>)',html,re.S)
if not m: raise SystemExit("modulosEmbutidos nao encontrado")
mods=json.loads(m.group(2))
e=base64.b64decode(mods["extrator"]).decode("utf-8")

e=e.replace(
"""let DATA={runs:[]},current=null;const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));""",
"""let DATA={runs:[]},current=null;const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function usuarioChave(){try{return parent.portalUsuarioAtual?.()?.login||'local'}catch{return 'local'}}
function storeKey(){return 'avec-extrator-local-v2:'+usuarioChave()}
function localData(){try{const d=JSON.parse(localStorage.getItem(storeKey())||'null');return d&&Array.isArray(d.runs)?d:{runs:[]}}catch{return {runs:[]}}}
function saveLocal(d){localStorage.setItem(storeKey(),JSON.stringify({updated_at:new Date().toISOString(),runs:d.runs||[]}))}
function mergeLocalRun(run){const d=localData(),k=[run.query?.nicho,run.query?.cidade,run.query?.bairro||''].map(norm).join('|');d.runs=(d.runs||[]).filter(r=>[r.query?.nicho,r.query?.cidade,r.query?.bairro||''].map(norm).join('|')!==k);d.runs.unshift(run);saveLocal(d);DATA=d;return d}"""
)

e=re.sub(r"async function load\(\)\{.*?\}\nconst NICHOS=", """async function load(){
  DATA=localData();
  $('#status').textContent='Dados deste navegador';
  await build();
}
const NICHOS=""", e, flags=re.S)

e=e.replace("Regiões que o GitHub Actions já varreu.","Suas pesquisas salvas neste navegador.")
e=e.replace('<div class="ey">Monitoramento</div>','<div class="ey">Seu histórico</div>')
e=e.replace('<h3 style="margin:6px 0 3px">Cobertura</h3>','<h3 style="margin:6px 0 3px">Pesquisas deste navegador</h3>')
e=e.replace(
"A base é atualizada automaticamente. Na primeira coleta todos aparecem como novos; nas próximas rodadas o histórico identifica o que entrou depois.",
"Seu histórico e seus leads ficam salvos somente neste navegador e neste usuário. Outro franqueado não vê suas pesquisas nem sua lista de leads."
)
e=e.replace('<div id="coverage" class="cover"></div>',
'<div style="display:flex;justify-content:flex-end;margin:10px 0 0"><button class="btn linha" id="limparHistorico" type="button">Limpar meu histórico</button></div><div id="coverage" class="cover"></div>')

e=re.sub(r"async function buscarAgora\(\)\{.*?\n\}\nfunction exportCsv\(\)", """async function buscarAgora(){
 const nicho=$('#nicho').value,cidade=$('#cidade').value,bairro=bairroReal();
 const existente=findRun();
 if(existente){show();return}
 const btn=$('#buscar');btn.disabled=true;const old=btn.textContent;btn.textContent='Enviando pesquisa...';
 try{
   if(!parent.portalSolicitarExtracao) throw new Error('Atualize o Portal para habilitar novas coletas.');
   const inicio=Date.now();
   await parent.portalSolicitarExtracao({nicho,cidade,bairro,max_results:80});
   btn.textContent='Coletando...'; $('#atualizado').textContent='Pesquisa enviada. O resultado sera salvo somente neste navegador.';
   $('#tbody').innerHTML='<tr><td colspan="7" class="empty">Coletando '+esc(nicho)+' em '+esc(bairro||'todos os bairros')+' · '+esc(cidade)+'.</td></tr>';
   for(let i=0;i<80;i++){
     await new Promise(r=>setTimeout(r,15000));
     try{
       const rr=await fetch('extrator-data/latest.json?ts='+Date.now(),{cache:'no-store'});
       if(!rr.ok) continue;
       const central=await rr.json();
       const n=norm(nicho),c=norm(cidade),b=norm(bairro);
       const achou=(central.runs||[]).find(r=>norm(r.query?.nicho)===n&&norm(r.query?.cidade)===c&&norm(r.query?.bairro||'')===b);
       if(achou&&new Date(achou.finished_at||0).getTime()>=inicio-60000){
         mergeLocalRun(achou);renderCoverage();show();return;
       }
     }catch{}
   }
   throw new Error('A coleta continua em processamento. Volte em alguns minutos e pesquise novamente.');
 }catch(err){$('#atualizado').textContent=err.message||'Nao foi possivel iniciar a coleta.'}
 finally{btn.disabled=false;btn.textContent=old}
}
function exportCsv()""", e, flags=re.S)

e=e.replace("$('#csv').addEventListener('click',exportCsv);load();",
"$('#csv').addEventListener('click',exportCsv);$('#limparHistorico').addEventListener('click',()=>{if(confirm('Apagar somente o historico de leads deste navegador?')){localStorage.removeItem(storeKey());DATA={runs:[]};current=null;renderCoverage();show()}});load();")

mods["extrator"]=base64.b64encode(e.encode("utf-8")).decode("ascii")
html=html[:m.start(2)]+json.dumps(mods,separators=(",",":"))+html[m.end(2):]
p.write_text(html,encoding="utf-8")
print("patched",len(e))
