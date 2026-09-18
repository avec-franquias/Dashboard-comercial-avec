import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "config", "instagram-queries.json");
const DATA_DIR = path.join(ROOT, "instagram-data");
const LATEST = path.join(DATA_DIR, "latest.json");

const clean = s => String(s || "").trim();
const norm = s => clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = s => clean(String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " "));

async function readJson(file, fallback){
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, value){
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function queryKey(q){
  return [q.nicho,q.uf,q.cidade,q.bairro,q.palavra_chave].map(norm).join("|");
}
function buildQueries(q){
  const local=[q.bairro,q.cidade,q.uf].filter(Boolean).join(" ");
  const base=[q.nicho,q.palavra_chave,local].filter(Boolean).join(" ");
  return [...new Set([
    `site:instagram.com ${base}`,
    q.cidade && q.nicho ? `site:instagram.com "${q.cidade}" "${q.nicho}"` : "",
    q.bairro ? `site:instagram.com "${q.bairro}" "${q.cidade}" ${q.nicho}` : "",
    q.palavra_chave ? `site:instagram.com "${q.palavra_chave}" "${q.cidade}"` : ""
  ].filter(Boolean))];
}
function instagramFromUrl(raw){
  try{
    let href=raw;
    if(href.startsWith("//")) href="https:"+href;
    const u=new URL(href,"https://duckduckgo.com");
    if(u.hostname.includes("duckduckgo.com") && u.searchParams.get("uddg")) href=decodeURIComponent(u.searchParams.get("uddg"));
    const p=new URL(href);
    if(!/(^|\.)instagram\.com$/i.test(p.hostname)) return null;
    const parts=p.pathname.split("/").filter(Boolean);
    if(!parts.length) return null;
    const username=parts[0].replace(/^@/,"");
    if(["p","reel","reels","stories","explore","accounts","directory","tv","about"].includes(username.toLowerCase())) return null;
    if(!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
    return {username, profile_url:`https://www.instagram.com/${username}/`};
  }catch{return null}
}
async function searchDDG(term, limit){
  const url="https://html.duckduckgo.com/html/?q="+encodeURIComponent(term);
  const r=await fetch(url,{headers:{
    "user-agent":"Mozilla/5.0 (compatible; PortalFranqueadoInstagram/1.0)",
    "accept-language":"pt-BR,pt;q=0.9,en;q=0.7"
  }});
  if(!r.ok) throw new Error("Busca web HTTP "+r.status);
  const html=await r.text();
  const out=[];
  const re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html)) && out.length<limit){
    const insta=instagramFromUrl(m[1]);
    if(!insta) continue;
    const title=stripHtml(m[2]);
    const name=title.replace(/\s*[•|-]\s*Instagram.*$/i,"").replace(/\s*\(@?[^)]+\)\s*$/,"").trim();
    out.push({
      ...insta,
      name,
      bio:title,
      followers:null,
      type:"Não identificado",
      whatsapp:"",
      phone:"",
      email:"",
      website:"",
      city:"",
      last_post:"",
      source:"duckduckgo"
    });
  }
  return out;
}
async function collect(q){
  const wanted=Math.min(Math.max(Number(q.limite)||100,1),200);
  const all=new Map();
  for(const term of buildQueries(q)){
    if(all.size>=wanted) break;
    const batch=await searchDDG(term, Math.min(wanted-all.size,50));
    for(const lead of batch){
      const k=lead.username.toLowerCase();
      if(!all.has(k)) all.set(k,{...lead,city:q.cidade});
    }
    await sleep(700);
  }
  return [...all.values()].slice(0,wanted);
}

const envQuery = {
  nicho:clean(process.env.INSTAGRAM_NICHO),
  uf:clean(process.env.INSTAGRAM_UF).toUpperCase(),
  cidade:clean(process.env.INSTAGRAM_CIDADE),
  bairro:clean(process.env.INSTAGRAM_BAIRRO),
  palavra_chave:clean(process.env.INSTAGRAM_PALAVRA_CHAVE),
  limite:Number(process.env.INSTAGRAM_LIMITE)||0
};
const hasEnv = !!(envQuery.nicho || envQuery.cidade || envQuery.palavra_chave);
const cfg = await readJson(CONFIG,{queries:[]});
let queries = hasEnv ? [envQuery] : (Array.isArray(cfg.queries)?cfg.queries.filter(q=>q.enabled!==false):[]);
if(!queries.length){
  console.log("Nenhuma busca de Instagram configurada.");
  process.exit(0);
}

const latest = await readJson(LATEST,{runs:[]});
const oldRuns = Array.isArray(latest.runs)?latest.runs:[];
const outRuns = [...oldRuns];

for(const q0 of queries){
  const q = {
    nicho:clean(q0.nicho),
    uf:clean(q0.uf).toUpperCase(),
    cidade:clean(q0.cidade),
    bairro:clean(q0.bairro),
    palavra_chave:clean(q0.palavra_chave),
    limite:Math.min(Math.max(Number(q0.limite)||100,1),200)
  };
  if(!q.nicho && !q.cidade && !q.palavra_chave) continue;
  console.log("Buscando Instagram:", q);
  const previous = [...oldRuns].reverse().find(r=>queryKey(r.query||{})===queryKey(q));
  const previousUsers = new Set((previous?.results||[]).map(x=>String(x.username||"").toLowerCase()));
  const results = await collect(q);
  const newUsernames = results.map(x=>x.username).filter(u=>!previousUsers.has(String(u).toLowerCase()));
  const run = {
    query:q,
    results,
    total:results.length,
    new_count:newUsernames.length,
    new_usernames:newUsernames,
    finished_at:new Date().toISOString()
  };
  const idx = outRuns.findIndex(r=>queryKey(r.query||{})===queryKey(q));
  if(idx>=0) outRuns[idx]=run; else outRuns.push(run);
}

await writeJson(LATEST,{runs:outRuns});
console.log("Base Instagram atualizada:", outRuns.length, "buscas.");
