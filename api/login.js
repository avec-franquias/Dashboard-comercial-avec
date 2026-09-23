import crypto from 'node:crypto';
import fs from 'node:fs/promises';

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
}
function body(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}')}catch{return {}}
}
function confere(senha,guardado){
  const [tipo,iter,salt,hash]=String(guardado||'').split('$');
  if(tipo!=='pbkdf2'||!iter||!salt||!hash)return false;
  const got=crypto.pbkdf2Sync(Buffer.from(String(senha),'utf8'),Buffer.from(String(salt),'utf8'),Number(iter),32,'sha256').toString('hex');
  try{
    const a=Buffer.from(got,'hex'), b=Buffer.from(hash,'hex');
    return a.length===b.length && crypto.timingSafeEqual(a,b);
  }catch{return false}
}
function criarToken(u){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret) throw new Error('Chave administrativa indisponivel no servidor');
  const payload=Buffer.from(JSON.stringify({login:u.login,papel:u.papel,exp:Date.now()+30*24*60*60*1000})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+sig;
}
async function carregarUsuarios(){
  try{
    const txt=await fs.readFile(new URL('../usuarios.json',import.meta.url),'utf8');
    const db=JSON.parse(txt);
    if(Array.isArray(db.usuarios)) return db;
  }catch{}
  try{
    const txt=await fs.readFile(process.cwd()+'/usuarios.json','utf8');
    const db=JSON.parse(txt);
    if(Array.isArray(db.usuarios)) return db;
  }catch{}
  throw new Error('Base de usuarios indisponivel no servidor');
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method==='GET'){
    try{
      const db=await carregarUsuarios();
      return res.status(200).json({ok:true,usuarios:(db.usuarios||[]).length});
    }catch(e){
      return res.status(500).json({ok:false,error:e.message});
    }
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const b=body(req),login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
    if(!login||!senha)return res.status(400).json({ok:false,error:'Informe usuario e senha'});
    const db=await carregarUsuarios();
    const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===login);
    if(!u||!confere(senha,u.senha))return res.status(401).json({ok:false,error:'Usuario ou senha incorretos'});
    if(!u.ativo)return res.status(403).json({ok:false,error:'Acesso desativado'});
    const usuario={login:u.login,nome:u.nome,papel:u.papel,ativo:u.ativo,modulos:u.modulos||[]};
    const token=u.papel==='admin'?criarToken(u):null;
    return res.status(200).json({ok:true,usuario,token});
  }catch(e){return res.status(500).json({ok:false,error:e.message||'Falha no login'})}
}
