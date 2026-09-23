import fs from 'node:fs/promises';

let CACHE=null;
const DINAMICO=new Map();
const chave=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
const ESTADO_NOME={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const cidadeLimpa=(cidade,uf)=>String(cidade||'')
  .replace(new RegExp('\\s*[,\\-–—]\\s*'+String(uf||'').trim()+'\\s*$','i'),'')
  .trim();

async function base(){
  if(CACHE) return CACHE;
  CACHE=JSON.parse(await fs.readFile(new URL('../geo/bairros-br.json',import.meta.url),'utf8'));
  return CACHE;
}
async function fetchJson(url,opts={},timeout=12000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:c.signal});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }finally{clearTimeout(t)}
}
async function buscarOSM(nome,uf){
  const ck=uf+'|'+chave(nome);
  if(DINAMICO.has(ck)) return DINAMICO.get(ck);

  const q=new URLSearchParams({
    city:nome,
    state:ESTADO_NOME[uf]||uf,
    country:'Brazil',
    format:'jsonv2',
    limit:'5',
    addressdetails:'1'
  });
  const nr=await fetchJson(
    'https://nominatim.openstreetmap.org/search?'+q.toString(),
    {headers:{'User-Agent':'PortalFranqueadoAVEC/1.0','Accept-Language':'pt-BR'}},
    10000
  );
  const p=(nr||[]).find(x=>{
    const a=x.address||{};
    const stateCode=String(a['ISO3166-2-lvl4']||'').split('-').pop().toUpperCase();
    return !stateCode || stateCode===uf;
  }) || nr?.[0];

  if(!p){DINAMICO.set(ck,[]);return [];}
  const id=Number(p.osm_id);
  const areaId=p.osm_type==='relation'?3600000000+id:p.osm_type==='way'?2400000000+id:null;
  if(!areaId){DINAMICO.set(ck,[]);return [];}

  const over='[out:json][timeout:20];area('+areaId+')->.a;(nwr["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.a);nwr["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a););out tags;';
  const eps=[
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  for(const ep of eps){
    try{
      const oj=await fetchJson(ep,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'PortalFranqueadoAVEC/1.0'},
        body:'data='+encodeURIComponent(over)
      },22000);
      const arr=[...new Set((oj.elements||[])
        .map(x=>String(x.tags?.name||'').trim())
        .filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,'pt-BR'));
      if(arr.length){DINAMICO.set(ck,arr);return arr;}
    }catch{}
  }
  DINAMICO.set(ck,[]);
  return [];
}

export default async function handler(req,res){
  try{
    const uf=String(req.query?.uf||'').trim().toUpperCase();
    const nome=cidadeLimpa(req.query?.cidade||'',uf);
    const cidade=chave(nome);
    if(!uf||!cidade) return res.status(400).json({ok:false,bairros:[]});

    const b=await base();
    let bairros=Array.isArray(b?.[uf]?.[cidade])?b[uf][cidade]:[];
    let fonte='base';

    // Responde imediatamente para cidades com fallback conhecido.
    if(!bairros.length && uf==='GO' && cidade==='goiania'){
      bairros=['Aeroviário','Alto da Glória','Bueno','Campinas','Centro','Coimbra','Crimeia Leste','Crimeia Oeste','Fama','Goiá','Jardim América','Jardim Goiás','Jardim Novo Mundo','Leste Universitário','Marista','Negrão de Lima','Nova Suíça','Pedro Ludovico','Setor Oeste','Setor Sul','Vila Nova'];
      fonte='fallback';
    }

    // Só consulta a fonte externa se a base local e os fallbacks não tiverem dados.
    if(!bairros.length){
      try{
        bairros=await buscarOSM(nome,uf);
        fonte=bairros.length?'osm':'sem_dados';
      }catch{
        bairros=[];
        fonte='sem_dados';
      }
    }

    res.setHeader('Cache-Control',fonte==='base'
      ?'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
      :'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

    return res.status(200).json({ok:true,uf,cidade:nome,bairros,fonte});
  }catch(e){
    return res.status(500).json({ok:false,bairros:[],error:e.message||String(e)});
  }
}
