import fs from "node:fs/promises";
const nicho=String(process.env.REGION_NICHO||"Salão de beleza").trim();
const geo=JSON.parse(await fs.readFile("geo/bairros-br.json","utf8"));
const latest=JSON.parse(await fs.readFile("extrator-data/latest.json","utf8").catch(()=>"{\"runs\":[]}"));
const runs=Array.isArray(latest.runs)?latest.runs:[];
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const infos=runs.map(r=>{
  const raw=String(r.query?.cidade||"").trim();
  const m=raw.match(/,\s*([A-Z]{2})$/i);
  return {uf:(m?.[1]||"").toUpperCase(),cidade:norm(raw.replace(/,\s*[A-Z]{2}$/i,"")),nicho:norm(r.query?.nicho||""),finished:new Date(r.finished_at||0).getTime()};
}).filter(x=>x.nicho===norm(nicho));
let chosen=null;
const pendentes=[];
for(const uf of Object.keys(geo)){
  for(const [cidade,bairros] of Object.entries(geo[uf]||{})){
    if(!infos.some(x=>x.uf===uf&&x.cidade===norm(cidade))){
      pendentes.push({
        uf,
        cidade,
        prioridade:Array.isArray(bairros)?bairros.length:0
      });
    }
  }
}
pendentes.sort((a,b)=>b.prioridade-a.prioridade||a.uf.localeCompare(b.uf)||a.cidade.localeCompare(b.cidade,"pt-BR"));
if(pendentes.length){
  const p=pendentes[0];
  chosen={uf:p.uf,cidade:p.cidade,fase:"cidade-prioritaria",prioridade:p.prioridade};
}
if(!chosen&&infos.length){
  const oldest=[...infos].sort((a,b)=>a.finished-b.finished)[0];
  const cidade=Object.keys(geo[oldest.uf]||{}).find(x=>norm(x)===oldest.cidade)||oldest.cidade;
  chosen={uf:oldest.uf,cidade,fase:"renovacao"};
}
if(!chosen)process.exit(0);
const sh=s=>"'" + String(s??"").replace(/'/g,"'\\''") + "'";
const lines=[
  "uf="+sh(chosen.uf),
  "cidade="+sh(chosen.cidade),
  "cidade_com_uf="+sh(chosen.cidade+", "+chosen.uf),
  "bairro="+sh(""),
  "nicho="+sh(nicho),
  "fase="+sh(chosen.fase),
  "has_task=true"
].join("\n")+"\n";
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,lines);
console.log(JSON.stringify({...chosen,nicho}));