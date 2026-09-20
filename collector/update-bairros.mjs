import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const FILE=path.join(ROOT,'geo','bairros-br.json');
const TARGET=String(process.env.BAIRROS_CIDADES||'').split(';').map(x=>x.trim()).filter(Boolean);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');

async function fetchJson(url,opts={},timeout=25000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  try{const r=await fetch(url,{...opts,signal:c.signal}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json();}
  finally{clearTimeout(t)}
}
async function bairrosCidade(nome,uf){
  const q=new URLSearchParams({city:nome,state:uf,country:'Brazil',format:'jsonv2',limit:'1',addressdetails:'1'});
  const nr=await fetchJson('https://nominatim.openstreetmap.org/search?'+q.toString(),{headers:{'User-Agent':'PortalFranqueadoAVEC/1.0','Accept-Language':'pt-BR'}},20000);
  const p=nr?.[0]; if(!p) return [];
  const id=Number(p.osm_id); const areaId=p.osm_type==='relation'?3600000000+id:p.osm_type==='way'?2400000000+id:null;
  if(!areaId) return [];
  const over='[out:json][timeout:30];area('+areaId+')->.a;(nwr["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.a);nwr["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a););out tags;';
  const eps=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
  for(const ep of eps){
    try{
      const oj=await fetchJson(ep,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(over)},35000);
      const arr=[...new Set((oj.elements||[]).map(x=>x.tags?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      if(arr.length) return arr;
    }catch(e){console.warn('Falha',nome,uf,ep,e.message)}
  }
  return [];
}

const base=JSON.parse(await fs.readFile(FILE,'utf8'));
const targets=TARGET.length?TARGET:[
  'Curitiba,PR','Joinville,SC','Florianópolis,SC','Campinas,SP','Brasília,DF'
];
for(const item of targets){
  const [nomeRaw,ufRaw]=item.split(','); const nome=String(nomeRaw||'').trim(),uf=String(ufRaw||'').trim().toUpperCase();
  if(!nome||!uf) continue;
  base[uf] ||= {};
  const k=key(nome);
  if(Array.isArray(base[uf][k])&&base[uf][k].length){console.log('Já existe',nome,uf,base[uf][k].length);continue}
  console.log('Buscando bairros:',nome,uf);
  const arr=await bairrosCidade(nome,uf);
  if(arr.length){base[uf][k]=arr; console.log('Salvos',arr.length,'bairros');}
  else console.warn('Sem bairros encontrados:',nome,uf);
  await sleep(1200);
}
await fs.writeFile(FILE,JSON.stringify(base), 'utf8');
console.log('Base de bairros atualizada.');
