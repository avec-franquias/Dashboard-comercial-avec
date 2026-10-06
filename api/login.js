import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const REPO=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const FILE='usuarios.json';
const MODS=['ativacao','vendas','arvore','previsao','taxas','propostas','instagram','clientes','extrator','central','reunioes','roadmap'];

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Cache-Control','no-store');
}
function body(req){if(req.body&&typeof req.body==='object')return req.body;try{return JSON.parse(req.body||'{}')}catch{return {}}}
function confere(senha,guardado){
  const [tipo,iter,salt,hash]=String(guardado||'').split('$');
  if(tipo!=='pbkdf2'||!iter||!salt||!hash)return false;
  const got=crypto.pbkdf2Sync(Buffer.from(String(senha),'utf8'),Buffer.from(String(salt),'utf8'),Number(iter),32,'sha256').toString('hex');
  try{const a=Buffer.from(got,'hex'),b=Buffer.from(hash,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}
}
function hashSenha(senha){
  const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
  return 'pbkdf2$'+iter+'$'+salt+'$'+crypto.pbkdf2Sync(String(senha),salt,iter,32,'sha256').toString('hex');
}
function criarToken(u){
  const secret=process.env.PORTAL_SESSION_SECRET||process.env.GITHUB_TOKEN;
  if(!secret)throw new Error('Chave de sessão indisponível no servidor.');
  const payload=Buffer.from(JSON.stringify({login:u.login,papel:u.papel,franquiaId:u.franquiaId||null,exp:Date.now()+30*24*60*60*1000})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+sig;
}
function lerToken(req){
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const [payload,sig]=raw.split('.');
  if(!payload||!sig)throw Object.assign(new Error('Sessão inválida. Entre novamente no Portal.'),{status:401});
  const secret=process.env.PORTAL_SESSION_SECRET||process.env.GITHUB_TOKEN;
  if(!secret)throw new Error('Chave de sessão indisponível no servidor.');
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  try{
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error();
  }catch{throw Object.assign(new Error('Sessão inválida. Entre novamente no Portal.'),{status:401});}
  let data=null;
  try{data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))}catch{}
  if(!data?.login||!data.exp||Date.now()>Number(data.exp))throw Object.assign(new Error('Sua sessão expirou. Entre novamente no Portal.'),{status:401});
  return data;
}
function ghHeaders(){
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Integração do Portal com o GitHub indisponível.');
  return {Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'};
}
async function carregarLocal(){
  try{const txt=await fs.readFile(new URL('../usuarios.json',import.meta.url),'utf8');const db=JSON.parse(txt);if(Array.isArray(db.usuarios))return db}catch{}
  try{const txt=await fs.readFile(process.cwd()+'/usuarios.json','utf8');const db=JSON.parse(txt);if(Array.isArray(db.usuarios))return db}catch{}
  throw new Error('Base de usuários indisponível no servidor.');
}
async function carregarUsuarios(){
  const t=process.env.GITHUB_TOKEN;
  if(t){
    try{
      const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+FILE+'?ref='+encodeURIComponent(BRANCH),{headers:ghHeaders(),cache:'no-store'});
      if(r.ok){const j=await r.json();const db=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));if(Array.isArray(db.usuarios))return db}
    }catch{}
  }
  return carregarLocal();
}
async function lerUsuariosGitHub(){
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers:ghHeaders(),cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar os acessos no GitHub.');
  const cur=await r.json();
  const db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  if(!Array.isArray(db.usuarios))throw new Error('Base de usuários inválida.');
  return {url,cur,db};
}
async function salvarUsuarios(url,cur,db,mensagem){
  db.atualizadoEm=new Date().toISOString();
  const w=await fetch(url,{method:'PUT',headers:ghHeaders(),body:JSON.stringify({message:mensagem,branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
  if(!w.ok){
    let detail='';try{detail=(await w.json()).message||''}catch{}
    throw new Error('Não foi possível salvar a alteração de acesso.'+(detail?' '+detail:''));
  }
}
async function recuperar(b,res){
  const login=String(b.login||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,80}$/.test(login))return res.status(400).json({ok:false,error:'Informe seu usuário do Portal.'});
  const {url,cur,db}=await lerUsuariosGitHub();
  const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===login);
  if(b.action==='request-password-reset'){
    if(u?.ativo){
      u.recuperacaoSolicitadaEm=new Date().toISOString();
      await salvarUsuarios(url,cur,db,'Portal: solicita redefinição de senha');
    }
    return res.status(200).json({ok:true,message:'Solicitação registrada. A franqueadora poderá redefinir sua senha.'});
  }
  const codigo=String(b.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!u?.ativo||u.papel!=='admin'||codigo.length!==16||!confere(codigo,u.recuperacao))return res.status(400).json({ok:false,error:'Usuário ou código de recuperação incorretos.'});
  const senha=String(b.senha||'');
  if(senha.length<8)return res.status(400).json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'});
  u.senha=hashSenha(senha);
  delete u.recuperacaoSolicitadaEm;
  await salvarUsuarios(url,cur,db,'Portal: recuperação de acesso');
  return res.status(200).json({ok:true,message:'Senha redefinida. Entre com a nova senha.'});
}
async function trocarSenhaPropria(b,req,res){
  const sessao=lerToken(req);
  const senhaAtual=String(b.senhaAtual||''),senhaNova=String(b.senhaNova||'');
  if(senhaNova.length<8)return res.status(400).json({ok:false,error:'A nova senha precisa ter pelo menos 8 caracteres.'});
  const {url,cur,db}=await lerUsuariosGitHub();
  const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===String(sessao.login||'').toLowerCase());
  if(!u?.ativo)return res.status(403).json({ok:false,error:'Acesso desativado.'});
  if(!confere(senhaAtual,u.senha))return res.status(400).json({ok:false,error:'Senha atual incorreta.'});
  u.senha=hashSenha(senhaNova);
  delete u.recuperacaoSolicitadaEm;
  await salvarUsuarios(url,cur,db,'Portal: '+u.login+' trocou a própria senha');
  return res.status(200).json({ok:true,message:'Senha alterada com sucesso.'});
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
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method==='GET'){
    try{const db=await carregarUsuarios();return res.status(200).json({ok:true,usuarios:(db.usuarios||[]).length})}
    catch(e){return res.status(500).json({ok:false,error:e.message||'Falha ao consultar usuários.'})}
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const b=body(req);
    if(b.action==='change-password')return await trocarSenhaPropria(b,req,res);
    if(['request-password-reset','recover-password'].includes(b.action))return await recuperar(b,res);
    const login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
    if(!login||!senha)return res.status(400).json({ok:false,error:'Informe usuário e senha.'});
    const db=await carregarUsuarios();
    const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===login);
    if(!u||!confere(senha,u.senha))return res.status(401).json({ok:false,error:'Usuário ou senha incorretos.'});
    if(!u.ativo)return res.status(403).json({ok:false,error:'Acesso desativado.'});
    const usuario={login:u.login,nome:u.nome,papel:u.papel,franquiaId:u.franquiaId||null,ativo:u.ativo,modulos:modsDoGrupo(db,u)};
    return res.status(200).json({ok:true,usuario,token:criarToken(u)});
  }catch(e){
    console.error('Portal login:',e);
    return res.status(e.status||500).json({ok:false,error:e.message||'Falha no login.'});
  }
}
