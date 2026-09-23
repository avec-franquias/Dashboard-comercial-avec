import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const JSON_FILE=path.join(ROOT,'geo','bairros-br.json');
const CSV_FILE=path.join(ROOT,'geo','bairros-br.csv');

const BATCH=Math.max(40,Math.min(240,Number(process.env.BAIRROS_BATCH||160)));
const CONCURRENCY=Math.max(2,Math.min(12,Number(process.env.BAIRROS_CONCURRENCY||8)));
const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');

async function fetchJson(url,opts={},timeout=9000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:c.signal});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }finally{clearTimeout(t)}
}

async function bairrosCidade(nome,uf){
  const q=new URLSearchParams({city:nome,state:uf,country:'Brazil',format:'jsonv2',limit:'2',addressdetails:'1'});
  let nr;
  try{
    nr=await fetchJson('https://nominatim.openstreetmap.org/search?'+q.toString(),{
      headers:{'User-Agent':'PortalFranqueadoAVEC/1.0','Accept-Language':'pt-BR'}
    },7000);
  }catch{return []}

  const p=(nr||[]).find(x=>String(x?.address?.country_code||'').toLowerCase()==='br')||(nr||[])[0];
  if(!p)return[];

  const id=Number(p.osm_id);
  const areaId=p.osm_type==='relation'?3600000000+id:p.osm_type==='way'?2400000000+id:null;
  if(!areaId)return[];

  const over='[out:json][timeout:12];area('+areaId+')->.a;(nwr["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.a);nwr["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a););out tags;';
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];

  for(const ep of endpoints){
    try{
      const oj=await fetchJson(ep,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'PortalFranqueadoAVEC/1.0'},
        body:'data='+encodeURIComponent(over)
      },14000);

      const arr=[...new Set((oj.elements||[])
        .map(x=>String(x.tags?.name||'').trim())
        .filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,'pt-BR'));

      if(arr.length)return arr;
    }catch{}
  }
  return[];
}

async function pool(items,worker,limit){
  let next=0;
  const results=new Array(items.length);
  async function run(){
    while(true){
      const i=next++;
      if(i>=items.length) return;
      try{results[i]=await worker(items[i],i)}
      catch(e){results[i]={ok:false,error:e?.message||String(e),item:items[i]}}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return results;
}

const base=JSON.parse(await fs.readFile(JSON_FILE,'utf8'));
const csv=await fs.readFile(CSV_FILE,'utf8');
const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).slice(1);

const cidades=[];
const seen=new Set();
for(const line of lines){
  if(!line.trim())continue;
  const cols=line.split(';');
  const uf=cols[0],cidade=cols[2];
  if(!uf||!cidade)continue;
  const k=uf+'|'+key(cidade);
  if(seen.has(k))continue;
  seen.add(k);
  if(!Array.isArray(base?.[uf]?.[key(cidade)])||!base[uf][key(cidade)].length)cidades.push({uf,cidade});
}

const lote=cidades.slice(0,BATCH);
console.log('Faltantes antes:',cidades.length,'Lote:',lote.length,'Concorrencia:',CONCURRENCY);

const resultados=await pool(lote,async item=>{
  const bairros=await bairrosCidade(item.cidade,item.uf);
  return {item,bairros};
},CONCURRENCY);

let ok=0,sem=0;
for(const r of resultados){
  const {uf,cidade}=r.item;
  const bairros=Array.isArray(r.bairros)?r.bairros:[];
  base[uf] ||= {};
  if(bairros.length){
    base[uf][key(cidade)]=bairros;
    ok++;
    console.log('OK',cidade,uf,bairros.length);
  }else{
    sem++;
    console.log('SEM',cidade,uf);
  }
}

await fs.writeFile(JSON_FILE,JSON.stringify(base),'utf8');
const restantes=cidades.length-ok;
await fs.writeFile(
  path.join(ROOT,'geo','bairros-nacional-progresso.json'),
  JSON.stringify({
    atualizadoEm:new Date().toISOString(),
    lote:lote.length,
    concorrencia:CONCURRENCY,
    preenchidos:ok,
    semResultado:sem,
    restantesEstimados:restantes
  },null,2),
  'utf8'
);
console.log('Preenchidos:',ok,'Sem resultado:',sem,'Restantes estimados:',restantes);
