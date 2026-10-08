import fs from "node:fs/promises";

const requestedUf=String(process.env.REGION_UF||"").trim().toUpperCase();
const nicho=String(process.env.REGION_NICHO||"Salão de beleza").trim();

const geo=JSON.parse(await fs.readFile("geo/bairros-br.json","utf8"));
const latest=JSON.parse(await fs.readFile("extrator-data/latest.json","utf8").catch(()=>"{\"runs\":[]}"));
const runs=Array.isArray(latest.runs)?latest.runs:[];

const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const runInfo=r=>{
  const raw=String(r.query?.cidade||"").trim();
  const m=raw.match(/,\s*([A-Z]{2})$/i);
  return {
    uf:(m?.[1]||"").toUpperCase(),
    cidade:norm(raw.replace(/,\s*[A-Z]{2}$/i,"")),
    bairro:norm(r.query?.bairro||""),
    nicho:norm(r.query?.nicho||""),
    finished:new Date(r.finished_at||0).getTime()
  };
};
const infos=runs.map(runInfo).filter(x=>x.nicho===norm(nicho));
const ufs=requestedUf?[requestedUf]:Object.keys(geo).sort();

let chosen=null;

// Fase 1: garantir pelo menos uma coleta por cidade em todo o Brasil.
for(const uf of ufs){
  const cities=geo[uf]||{};
  for(const cityKey of Object.keys(cities)){
    const exists=infos.some(x=>x.uf===uf&&x.cidade===norm(cityKey)&&x.bairro==="");
    if(!exists){chosen={uf,cidade:cityKey,bairro:"",fase:"cidade"};break}
  }
  if(chosen)break;
}

// Fase 2: depois de cobrir as cidades, preencher bairros catalogados.
if(!chosen){
  outer: for(const uf of ufs){
    const cities=geo[uf]||{};
    for(const [cityKey,bairros] of Object.entries(cities)){
      for(const bairro of (Array.isArray(bairros)?bairros:[])){
        const exists=infos.some(x=>x.uf===uf&&x.cidade===norm(cityKey)&&x.bairro===norm(bairro));
        if(!exists){chosen={uf,cidade:cityKey,bairro,fase:"bairro"};break outer}
      }
    }
  }
}

// Fase 3: se tudo já foi coberto, renova a coleta mais antiga.
if(!chosen&&infos.length){
  const oldest=[...infos].sort((a,b)=>a.finished-b.finished)[0];
  if(oldest?.uf&&oldest?.cidade){
    const cityKey=Object.keys(geo[oldest.uf]||{}).find(x=>norm(x)===oldest.cidade)||oldest.cidade;
    chosen={uf:oldest.uf,cidade:cityKey,bairro:oldest.bairro||"",fase:"renovacao"};
  }
}

if(!chosen){
  console.log("Nenhuma região pendente.");
  process.exit(0);
}

const out=process.env.GITHUB_OUTPUT;
const lines=[
  "uf="+chosen.uf,
  "cidade="+chosen.cidade,
  "cidade_com_uf="+chosen.cidade+", "+chosen.uf,
  "bairro="+chosen.bairro,
  "nicho="+nicho,
  "fase="+chosen.fase,
  "has_task=true"
].join("\n")+"\n";
if(out) await fs.appendFile(out,lines);
console.log(JSON.stringify({...chosen,nicho}));
