import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = new URL("./data/", import.meta.url);
const DB = new URL("./data/leads.json", import.meta.url);

const json = (res,status,body) => {
  res.writeHead(status,{
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":process.env.PORTAL_ORIGIN || "*",
    "access-control-allow-headers":"content-type, authorization",
    "access-control-allow-methods":"GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(body));
};
const body = req => new Promise((resolve,reject)=>{
  let s=""; req.on("data",c=>{s+=c;if(s.length>1_000_000)req.destroy()});
  req.on("end",()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}}); req.on("error",reject);
});
const load = async()=>{try{return JSON.parse(await readFile(DB,"utf8"))}catch{return []}};
const save = async rows=>{await mkdir(DATA_DIR,{recursive:true});await writeFile(DB,JSON.stringify(rows,null,2))};
const clean = s=>String(s||"").trim();
const normalizeLead = x => ({
  username:clean(x.username).replace(/^@/,""), name:clean(x.name), bio:clean(x.bio),
  followers:Number.isFinite(Number(x.followers))?Number(x.followers):null,
  type:clean(x.type)||"Não identificado", whatsapp:clean(x.whatsapp), phone:clean(x.phone),
  email:clean(x.email), website:clean(x.website), city:clean(x.city),
  profile_url:clean(x.profile_url)|| (x.username?"https://www.instagram.com/"+clean(x.username).replace(/^@/,"")+"/":""),
  last_post:clean(x.last_post), status:clean(x.status)||"Novo",
  collected_at:new Date().toISOString()
});

async function collectPublicProfiles(query){
  // Ponto de extensao do coletor. Mantemos o Portal independente do mecanismo de descoberta.
  // Configure INSTAGRAM_PROVIDER_URL para um servico/coletor permitido rodando na sua infraestrutura.
  const provider=process.env.INSTAGRAM_PROVIDER_URL;
  if(!provider) return {results:[], provider_configured:false};
  const r=await fetch(provider,{method:"POST",headers:{"content-type":"application/json","authorization":process.env.INSTAGRAM_PROVIDER_TOKEN?("Bearer "+process.env.INSTAGRAM_PROVIDER_TOKEN):""},body:JSON.stringify(query)});
  if(!r.ok) throw new Error("Provider HTTP "+r.status);
  const j=await r.json();
  return {results:(Array.isArray(j.results)?j.results:[]).map(normalizeLead),provider_configured:true};
}

const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS") return json(res,204,{});
  const u=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&u.pathname==="/health") return json(res,200,{ok:true,service:"instagram-extractor"});
  if(req.method==="GET"&&u.pathname==="/api/instagram/leads") return json(res,200,{results:await load()});
  if(req.method==="POST"&&u.pathname==="/api/instagram/search"){
    try{
      const q=await body(req);
      const query={nicho:clean(q.nicho),uf:clean(q.uf).toUpperCase(),cidade:clean(q.cidade),bairro:clean(q.bairro),palavra_chave:clean(q.palavra_chave),limite:Math.min(Math.max(Number(q.limite)||100,1),500)};
      if(!query.cidade&&!query.nicho&&!query.palavra_chave) return json(res,400,{error:"Informe nicho, cidade ou palavra-chave."});
      const found=await collectPublicProfiles(query);
      const old=await load(), byUser=new Map(old.map(x=>[String(x.username).toLowerCase(),x]));
      for(const lead of found.results){const k=lead.username.toLowerCase();if(!k)continue;const prev=byUser.get(k);byUser.set(k,{...prev,...lead,status:prev?"Conhecido":"Novo"})}
      const all=[...byUser.values()];await save(all);
      return json(res,200,{query,provider_configured:found.provider_configured,results:found.results.map(x=>({...x,status:old.some(o=>String(o.username).toLowerCase()===x.username.toLowerCase())?"Conhecido":"Novo"}))});
    }catch(e){return json(res,500,{error:e.message})}
  }
  json(res,404,{error:"not found"});
});
server.listen(PORT,()=>console.log("Instagram extractor API on :"+PORT));
