import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const JSON_FILE=path.join(ROOT,'geo','bairros-br.json');
const CSV_FILE=path.join(ROOT,'geo','bairros-br.csv');
const LIMIT=Math.max(10,Math.min(120,Number(process.env.BAIRROS_BATCH||60)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');

async function fetchJson(url,opts={},timeout=18000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{const r=await fetch(url,{...opts,signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
  finally{clearTimeout(t)}
}
async function bairrosCidade(nome,uf){
  const q=new URLSearchParams({city:nome,state:uf,country:'Brazil',format:'jsonv2',limit:'3',addressdetails:'1'});
  const nr=await fetchJson('https://nominatim.openstreetmap.org/search?'+q,{headers:{'User-Agent':'PortalFranqueadoAVEC/1.0','Accept-Language':'pt-BR'}},12000);
  const p=(nr||[]).find(x=>String(x?.address?.country_code||'').toLowerCase()==='br')||(nr||[])[0];
  if(!p)return[];
  const id=Number(p.osm_id),areaId=p.osm_type==='relation'?3600000000+id:p.osm_type==='way'?2400000000+id:null;
  if(!areaId)return[];
  const over='[out:json][timeout:20];area('+areaId+')->.a;(nwr["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.a);nwr["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a););out tags;';
  for(const ep of ['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter']){
    try{
      const oj=await fetchJson(ep,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'PortalFranqueadoAVEC/1.0'},body:'data='+encodeURIComponent(over)},25000);
      const arr=[...new Set((oj.elements||[]).map(x=>String(x.tags?.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      if(arr.length)return arr;
    }catch{}
  }
  return[];
}

const base=JSON.parse(await fs.readFile(JSON_FILE,'utf8'));
const csv=await fs.readFile(CSV_FILE,'utf8');
const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).slice(1);
const cidades=[];
const seen=new Set();
for(const line of lines){
  if(!line.trim())continue;
  const [uf,,cidade]=line.split(';');
  if(!uf||!cidade)continue;
  const k=uf+'|'+key(cidade);
  if(seen.has(k))continue;seen.add(k);
  if(!Array.isArray(base?.[uf]?.[key(cidade)])||!base[uf][key(cidade)].length)cidades.push({uf,cidade});
}
console.log('Faltantes antes:',cidades.length,'Batch:',LIMIT);
let ok=0,sem=0;
for(const item of cidades.slice(0,LIMIT)){
  try{
    const arr=await bairrosCidade(item.cidade,item.uf);
    base[item.uf] ||= {};
    if(arr.length){base[item.uf][key(item.cidade)]=arr;ok++;console.log('OK',item.cidade,item.uf,arr.length)}
    else{sem++;console.log('SEM',item.cidade,item.uf)}
  }catch(e){sem++;console.log('ERRO',item.cidade,item.uf,e.message)}
  await sleep(900);
}
await fs.writeFile(JSON_FILE,JSON.stringify(base),'utf8');
const restantes=cidades.length-ok;
await fs.writeFile(path.join(ROOT,'geo','bairros-nacional-progresso.json'),JSON.stringify({atualizadoEm:new Date().toISOString(),processados:cidades.slice(0,LIMIT).length,preenchidos:ok,semResultado:sem,restantesEstimados:restantes},null,2),'utf8');
console.log('Preenchidos:',ok,'Sem resultado:',sem,'Restantes estimados:',restantes);
