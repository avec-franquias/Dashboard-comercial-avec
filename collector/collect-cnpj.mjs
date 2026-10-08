import fs from "node:fs/promises";
const uf=(process.env.CNPJ_UF||"").trim().toUpperCase();
const cidade=(process.env.CNPJ_CIDADE||"").trim();
const nicho=(process.env.CNPJ_NICHO||"Salão de beleza").trim();
if(!uf||!cidade)throw new Error("UF/cidade obrigatórios");
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const mapa={"salao de beleza":["9602501","9602502"],"barbearia":["9602501"],"estetica":["9602502"],"academia":["9313100"],"pet shop":["4789004"],"banho e tosa":["9609208"],"veterinaria":["7500100"]};
const cnaes=mapa[norm(nicho)]||["9602501","9602502"];
const ir=await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/"+uf+"/municipios");
const municipios=await ir.json();
const m=municipios.find(x=>norm(x.nome)===norm(cidade));
if(!m)throw new Error("Município não encontrado");
let results=[];
for(const cnae of cnaes){
  let cursor="";
  for(let p=0;p<4;p++){
    const u=new URL("https://minhareceita.org/");
    u.searchParams.set("municipio",String(m.id));
    u.searchParams.set("cnae",cnae);
    u.searchParams.set("limit","1024");
    if(cursor)u.searchParams.set("cursor",cursor);
    const r=await fetch(u,{headers:{"accept":"application/json"}});
    if(!r.ok)break;
    const j=await r.json();
    results.push(...(j.data||[]));
    cursor=j.cursor||"";
    if(!cursor)break;
  }
}
const map=new Map();
for(const x of results){
  if(String(x.descricao_situacao_cadastral||"").toUpperCase()!=="ATIVA"&&Number(x.situacao_cadastral)!==2)continue;
  const cnpj=String(x.cnpj||"").replace(/\D/g,"");
  if(cnpj)map.set(cnpj,x);
}
const arr=[...map.values()];
await fs.mkdir("cnpj-data",{recursive:true});
let prev={runs:[]};try{prev=JSON.parse(await fs.readFile("cnpj-data/latest.json","utf8"))}catch{}
const key=norm(nicho)+"|"+uf+"|"+norm(cidade);
const runs=(prev.runs||[]).filter(r=>norm(r.query?.nicho)+"|"+String(r.query?.uf||"").toUpperCase()+"|"+norm(r.query?.cidade)!==key);
runs.push({query:{nicho,uf,cidade,cnaes},finished_at:new Date().toISOString(),total:arr.length,results:arr});
await fs.writeFile("cnpj-data/latest.json",JSON.stringify({generated_at:new Date().toISOString(),runs},null,2));
console.log("CNPJ:",cidade,uf,arr.length);