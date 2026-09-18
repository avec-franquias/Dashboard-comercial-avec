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
  let s="";
  req.on("data",c=>{s+=c;if(s.length>1_000_000) req.destroy()});
  req.on("end",()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});
  req.on("error",reject);
});

const load = async()=>{try{return JSON.parse(await readFile(DB,"utf8"))}catch{return []}};
const save = async rows=>{
  await mkdir(DATA_DIR,{recursive:true});
  await writeFile(DB,JSON.stringify(rows,null,2));
};
const clean = s=>String(s||"").trim();
const stripHtml = s=>clean(String(s||"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\s+/g," "));
const decodeHtml = s=>stripHtml(s);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

const normalizeLead = x => ({
  username:clean(x.username).replace(/^@/,""),
  name:clean(x.name),
  bio:clean(x.bio),
  followers:Number.isFinite(Number(x.followers))?Number(x.followers):null,
  type:clean(x.type)||"Não identificado",
  whatsapp:clean(x.whatsapp),
  phone:clean(x.phone),
  email:clean(x.email),
  website:clean(x.website),
  city:clean(x.city),
  profile_url:clean(x.profile_url)||(x.username?"https://www.instagram.com/"+clean(x.username).replace(/^@/,"")+"/":""),
  last_post:clean(x.last_post),
  source:clean(x.source)||"web-search",
  status:clean(x.status)||"Novo",
  collected_at:new Date().toISOString()
});

function buildQueries(query){
  const local=[query.bairro,query.cidade,query.uf].filter(Boolean).join(" ");
  const base=[query.nicho,query.palavra_chave,local].filter(Boolean).join(" ");
  const variants=[
    `site:instagram.com ${base}`,
    `site:instagram.com "${query.cidade}" "${query.nicho}"`,
    query.bairro?`site:instagram.com "${query.bairro}" "${query.cidade}" ${query.nicho}`:"",
    query.palavra_chave?`site:instagram.com "${query.palavra_chave}" "${query.cidade}"`:""
  ].filter(Boolean);
  return [...new Set(variants)];
}

function instagramFromUrl(raw){
  try{
    let href=raw;
    if(href.startsWith("//")) href="https:"+href;
    const u=new URL(href,"https://duckduckgo.com");
    if(u.hostname.includes("duckduckgo.com")&&u.searchParams.get("uddg")) href=decodeURIComponent(u.searchParams.get("uddg"));
    const p=new URL(href);
    if(!/(^|\.)instagram\.com$/i.test(p.hostname)) return null;
    const parts=p.pathname.split("/").filter(Boolean);
    if(!parts.length) return null;
    const username=parts[0].replace(/^@/,"");
    if(["p","reel","reels","stories","explore","accounts","directory","tv","about"].includes(username.toLowerCase())) return null;
    if(!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
    return {username,profile_url:`https://www.instagram.com/${username}/`};
  }catch{return null}
}

async function searchDuckDuckGo(query,limit){
  const url="https://html.duckduckgo.com/html/?q="+encodeURIComponent(query);
  const r=await fetch(url,{
    headers:{
      "user-agent":"Mozilla/5.0 (compatible; PortalFranqueadoLeadDiscovery/1.0)",
      "accept-language":"pt-BR,pt;q=0.9,en;q=0.7"
    }
  });
  if(!r.ok) throw new Error("Busca web HTTP "+r.status);
  const html=await r.text();
  const out=[];
  const re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))&&out.length<limit){
    const insta=instagramFromUrl(m[1]);
    if(!insta) continue;
    const title=decodeHtml(m[2]);
    const name=title
      .replace(/\s*[•|-]\s*Instagram.*$/i,"")
      .replace(/\s*\(@?[^)]+\)\s*$/,"")
      .trim();
    out.push(normalizeLead({...insta,name,bio:title,source:"duckduckgo"}));
  }
  return out;
}

async function collectBuiltIn(query){
  const wanted=Math.min(query.limite,200);
  const all=new Map();
  for(const q of buildQueries(query)){
    if(all.size>=wanted) break;
    const batch=await searchDuckDuckGo(q,Math.min(wanted-all.size,50));
    for(const lead of batch){
      const k=lead.username.toLowerCase();
      if(!all.has(k)) all.set(k,{...lead,city:query.cidade});
    }
    await sleep(700);
  }
  return [...all.values()].slice(0,wanted);
}

async function collectPublicProfiles(query){
  const provider=process.env.INSTAGRAM_PROVIDER_URL;
  if(provider){
    const r=await fetch(provider,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":process.env.INSTAGRAM_PROVIDER_TOKEN?("Bearer "+process.env.INSTAGRAM_PROVIDER_TOKEN):""
      },
      body:JSON.stringify(query)
    });
    if(!r.ok) throw new Error("Provider HTTP "+r.status);
    const j=await r.json();
    return {
      results:(Array.isArray(j.results)?j.results:[]).map(normalizeLead),
      provider:"external"
    };
  }
  return {results:await collectBuiltIn(query),provider:"duckduckgo"};
}

const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS") return json(res,204,{});
  const u=new URL(req.url,"http://localhost");

  if(req.method==="GET"&&u.pathname==="/health"){
    return json(res,200,{ok:true,service:"instagram-extractor",provider:process.env.INSTAGRAM_PROVIDER_URL?"external":"duckduckgo"});
  }

  if(req.method==="GET"&&u.pathname==="/api/instagram/leads"){
    return json(res,200,{results:await load()});
  }

  if(req.method==="POST"&&u.pathname==="/api/instagram/search"){
    try{
      const q=await body(req);
      const query={
        nicho:clean(q.nicho),
        uf:clean(q.uf).toUpperCase(),
        cidade:clean(q.cidade),
        bairro:clean(q.bairro),
        palavra_chave:clean(q.palavra_chave),
        limite:Math.min(Math.max(Number(q.limite)||100,1),500)
      };
      if(!query.cidade&&!query.nicho&&!query.palavra_chave){
        return json(res,400,{error:"Informe nicho, cidade ou palavra-chave."});
      }

      const found=await collectPublicProfiles(query);
      const old=await load();
      const byUser=new Map(old.map(x=>[String(x.username).toLowerCase(),x]));

      const response=[];
      for(const lead of found.results){
        const k=lead.username.toLowerCase();
        if(!k) continue;
        const prev=byUser.get(k);
        const merged={...prev,...lead,status:prev?"Conhecido":"Novo"};
        byUser.set(k,merged);
        response.push(merged);
      }

      await save([...byUser.values()]);
      return json(res,200,{query,provider:found.provider,results:response});
    }catch(e){
      return json(res,500,{error:e.message});
    }
  }

  json(res,404,{error:"not found"});
});

server.listen(PORT,()=>console.log("Instagram extractor API on :"+PORT));
