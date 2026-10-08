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
for(const uf of Object.keys(geo).sort()){
  for(const cidade of Object.keys(geo[uf]||{})){
    if(!infos.some(x=>x.uf===uf&&x.cidade===norm(cidade))){chosen={uf,cidade,fase:"cidade"};break}
  }
  if(chosen)break;
}
if(!chosen&&infos.length){
  const oldest=[...infos].sort((a,b)=>a.finished-b.finished)[0];
  const cidade=Object.keys(geo[oldest.uf]||{}).find(x=>norm(x)===oldest.cidade)||oldest.cidade;
  chosen={uf:oldest.uf,cidade,fase:"renovacao"};
}
if(!chosen)process.exit(0);
const lines=["uf="+chosen.uf,"cidade="+chosen.cidade,"cidade_com_uf="+chosen.cidade+", "+chosen.uf,"bairro=","nicho="+nicho,"fase="+chosen.fase,"has_task=true"].join("\n")+"\n";
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,lines);
console.log(JSON.stringify({...chosen,nicho}));