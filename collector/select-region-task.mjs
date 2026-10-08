import fs from "node:fs/promises";

const uf=String(process.env.REGION_UF||"").trim().toUpperCase();
const nicho=String(process.env.REGION_NICHO||"Salão de beleza").trim();
if(!uf) throw new Error("REGION_UF obrigatório");

const geo=JSON.parse(await fs.readFile("geo/bairros-br.json","utf8"));
const latest=JSON.parse(await fs.readFile("extrator-data/latest.json","utf8").catch(()=>"{\"runs\":[]}"));
const runs=Array.isArray(latest.runs)?latest.runs:[];

const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const cities=geo[uf]||{};
const seen=new Set(runs.filter(r=>norm(r.query?.nicho)===norm(nicho)).map(r=>[
  norm(String(r.query?.cidade||"").replace(/,\s*[A-Z]{2}$/i,"")),
  norm(r.query?.bairro||"")
].join("|")));

let cidade="",bairro="";
for(const cityKey of Object.keys(cities)){
  if(!seen.has(norm(cityKey)+"|")){cidade=cityKey;break}
}
if(!cidade){
  outer: for(const [cityKey,bairros] of Object.entries(cities)){
    for(const b of (Array.isArray(bairros)?bairros:[])){
      if(!seen.has(norm(cityKey)+"|"+norm(b))){cidade=cityKey;bairro=b;break outer}
    }
  }
}
if(!cidade){
  const oldest=runs
    .filter(r=>norm(r.query?.nicho)===norm(nicho)&&norm(String(r.query?.cidade||"").split(",").pop())===norm(uf))
    .sort((a,b)=>new Date(a.finished_at||0)-new Date(b.finished_at||0))[0];
  cidade=String(oldest?.query?.cidade||"").replace(/,\s*[A-Z]{2}$/i,"");
  bairro=String(oldest?.query?.bairro||"");
}
if(!cidade) process.exit(0);

const out=process.env.GITHUB_OUTPUT;
const lines=[
  "cidade="+cidade,
  "cidade_com_uf="+cidade+", "+uf,
  "bairro="+bairro,
  "nicho="+nicho
].join("\n")+"\n";
if(out) await fs.appendFile(out,lines);
console.log(JSON.stringify({uf,nicho,cidade,bairro}));
