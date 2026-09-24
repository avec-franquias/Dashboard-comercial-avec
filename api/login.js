import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const REPO=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const FILE='usuarios.json';
const MODS=['ativacao','arvore','previsao','taxas','propostas','instagram','clientes','extrator','central','reunioes'];

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
}
function body(req){if(req.body&&typeof req.body==='object') return req.body;try{return JSON.parse(req.body||'{}')}catch{return {}}}
function confere(senha,guardado){
  const [tipo,iter,salt,hash]=String(guardado||'').split('$');
  if(tipo!=='pbkdf2'||!iter||!salt||!hash)return false;
  const got=crypto.pbkdf2Sync(Buffer.from(String(senha),'utf8'),Buffer.from(String(salt),'utf8'),Number(iter),32,'sha256').toString('hex');
  try{const a=Buffer.from(got,'hex'), b=Buffer.from(hash,'hex');return a.length===b.length && crypto.timingSafeEqual(a,b)}catch{return false}
}
function criarToken(u){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret) throw new Error('Chave administrativa indisponivel no servidor');
  const payload=Buffer.from(JSON.stringify({login:u.login,papel:u.papel,franquiaId:u.franquiaId||null,exp:Date.now()+30*24*60*60*1000})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+sig;
}
async function carregarLocal(){
  try{const txt=await fs.readFile(new URL('../usuarios.json',import.meta.url),'utf8');const db=JSON.parse(txt);if(Array.isArray(db.usuarios)) return db}catch{}
  try{const txt=await fs.readFile(process.cwd()+'/usuarios.json','utf8');const db=JSON.parse(txt);if(Array.isArray(db.usuarios)) return db}catch{}
  throw new Error('Base de usuarios indisponivel no servidor');
}
async function carregarUsuarios(){
  const t=process.env.GITHUB_TOKEN;
  if(t){
    try{
      const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+FILE+'?ref='+encodeURIComponent(BRANCH),{headers:{Authorization:'Bearer '+t,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'}});
      if(r.ok){const j=await r.json();const db=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));if(Array.isArray(db.usuarios))return db}
    }catch{}
  }
  return carregarLocal();
}
function modsDoGrupo(db,u){
  if(u.papel==='admin')return [...MODS];
  if(!u.franquiaId)return [];
  const f=(db.franquias||[]).find(x=>x.id===u.franquiaId);
  const fm=Array.isArray(f?.modulos)?f.modulos.filter(x=>MODS.includes(x)):[];
  if(fm.length)return [...new Set(fm)];
  return [...new Set((db.usuarios||[]).filter(x=>x.franquiaId===u.franquiaId).flatMap(x=>Array.isArray(x.modulos)?x.modulos:[]).filter(x=>MODS.includes(x)))];
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method==='GET'){
    try{const db=await carregarUsuarios();return res.status(200).json({ok:true,usuarios:(db.usuarios||[]).length})}
    catch(e){return res.status(500).json({ok:false,error:e.message})}
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const b=body(req),login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
    if(!login||!senha)return res.status(400).json({ok:false,error:'Informe usuario e senha'});
    const db=await carregarUsuarios();
    const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===login);
    if(!u||!confere(senha,u.senha))return res.status(401).json({ok:false,error:'Usuario ou senha incorretos'});
    if(!u.ativo)return res.status(403).json({ok:false,error:'Acesso desativado'});
    const usuario={login:u.login,nome:u.nome,papel:u.papel,franquiaId:u.franquiaId||null,ativo:u.ativo,modulos:modsDoGrupo(db,u)};
    const token=criarToken(u);
    return res.status(200).json({ok:true,usuario,token});
  }catch(e){return res.status(500).json({ok:false,error:e.message||'Falha no login'})}
}
