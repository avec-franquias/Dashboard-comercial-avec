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
function lerToken(req){
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const [payload,sig]=raw.split('.');
  if(!payload||!sig)throw Object.assign(new Error('Sessão inválida. Entre novamente no Portal.'),{status:401});
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret)throw new Error('Chave administrativa indisponivel no servidor');
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  try{
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error();
  }catch{throw Object.assign(new Error('Sessão inválida. Entre novamente no Portal.'),{status:401});}
  let data;try{data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))}catch{}
  if(!data?.login||!data.exp||Date.now()>Number(data.exp))throw Object.assign(new Error('Sua sessão expirou. Entre novamente no Portal.'),{status:401});
  return data;
}
async function trocarSenhaPropria(b,req,res){
  const sessao=lerToken(req),senhaAtual=String(b.senhaAtual||''),senhaNova=String(b.senhaNova||'');
  if(senhaNova.length<8)return res.status(400).json({ok:false,error:'A nova senha precisa ter pelo menos 8 caracteres.'});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Alteração de senha indisponível no servidor.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'avec-portal-api'};
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers,cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar seu acesso. Tente novamente.');
  const cur=await r.json(),db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===String(sessao.login||'').toLowerCase());
  if(!u?.ativo)return res.status(403).json({ok:false,error:'Acesso desativado.'});
  if(!confere(senhaAtual,u.senha))return res.status(400).json({ok:false,error:'Senha atual incorreta.'});
  const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
  u.senha='pbkdf2
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
async function recuperar(b,res){
  const login=String(b.login||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,40}$/.test(login))return res.status(400).json({ok:false,error:'Informe seu usuário do Portal.'});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Recuperação indisponível. Procure a franqueadora.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'avec-portal-api'};
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers,cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar os acessos. Tente novamente.');
  const cur=await r.json(),db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(u=>u.login===login);
  let mudou=false;
  if(b.action==='request-password-reset'){
    if(u?.ativo&&!u.recuperacaoSolicitadaEm){u.recuperacaoSolicitadaEm=new Date().toISOString();mudou=true;}
  }else{
    const codigo=String(b.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!u?.ativo||u.papel!=='admin'||codigo.length!==16||!confere(codigo,u.recuperacao))return res.status(400).json({ok:false,error:'Usuário ou código de recuperação incorretos.'});
    const senha=String(b.senha||'');
    if(senha.length<8)return res.status(400).json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'});
    const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
    u.senha='pbkdf2$'+iter+'$'+salt+'$'+crypto.pbkdf2Sync(senha,salt,iter,32,'sha256').toString('hex');
    delete u.recuperacaoSolicitadaEm;mudou=true;
  }
  if(mudou){
    db.atualizadoEm=new Date().toISOString();
    const w=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Portal: recuperação de acesso',branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
    if(!w.ok)throw new Error('Não foi possível salvar a recuperação. Tente novamente.');
  }
  return res.status(200).json({ok:true,message:b.action==='request-password-reset'?'Se o usuário estiver ativo, a solicitação estará disponível para a franqueadora redefinir a senha.':'Senha redefinida. Entre com a nova senha.'});
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
    const b=body(req);
    if(b.action==='change-password')return await trocarSenhaPropria(b,req,res);
    if(['request-password-reset','recover-password'].includes(b.action))return await recuperar(b,res);
    const login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
    if(!login||!senha)return res.status(400).json({ok:false,error:'Informe usuario e senha'});
    const db=await carregarUsuarios();
    const u=(db.usuarios||[]).find(x=>String(x.login||'').toLowerCase()===login);
    if(!u||!confere(senha,u.senha))return res.status(401).json({ok:false,error:'Usuario ou senha incorretos'});
    if(!u.ativo)return res.status(403).json({ok:false,error:'Acesso desativado'});
    const usuario={login:u.login,nome:u.nome,papel:u.papel,franquiaId:u.franquiaId||null,ativo:u.ativo,modulos:modsDoGrupo(db,u)};
    const token=criarToken(u);
    return res.status(200).json({ok:true,usuario,token});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message||'Falha no login'})}
}
+iter+'
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
async function recuperar(b,res){
  const login=String(b.login||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,40}$/.test(login))return res.status(400).json({ok:false,error:'Informe seu usuário do Portal.'});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Recuperação indisponível. Procure a franqueadora.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'avec-portal-api'};
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers,cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar os acessos. Tente novamente.');
  const cur=await r.json(),db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(u=>u.login===login);
  let mudou=false;
  if(b.action==='request-password-reset'){
    if(u?.ativo&&!u.recuperacaoSolicitadaEm){u.recuperacaoSolicitadaEm=new Date().toISOString();mudou=true;}
  }else{
    const codigo=String(b.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!u?.ativo||u.papel!=='admin'||codigo.length!==16||!confere(codigo,u.recuperacao))return res.status(400).json({ok:false,error:'Usuário ou código de recuperação incorretos.'});
    const senha=String(b.senha||'');
    if(senha.length<8)return res.status(400).json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'});
    const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
    u.senha='pbkdf2$'+iter+'$'+salt+'$'+crypto.pbkdf2Sync(senha,salt,iter,32,'sha256').toString('hex');
    delete u.recuperacaoSolicitadaEm;mudou=true;
  }
  if(mudou){
    db.atualizadoEm=new Date().toISOString();
    const w=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Portal: recuperação de acesso',branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
    if(!w.ok)throw new Error('Não foi possível salvar a recuperação. Tente novamente.');
  }
  return res.status(200).json({ok:true,message:b.action==='request-password-reset'?'Se o usuário estiver ativo, a solicitação estará disponível para a franqueadora redefinir a senha.':'Senha redefinida. Entre com a nova senha.'});
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
    const b=body(req);
    if(['request-password-reset','recover-password'].includes(b.action))return await recuperar(b,res);
    const login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
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
+salt+'
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
async function recuperar(b,res){
  const login=String(b.login||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,40}$/.test(login))return res.status(400).json({ok:false,error:'Informe seu usuário do Portal.'});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Recuperação indisponível. Procure a franqueadora.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'avec-portal-api'};
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers,cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar os acessos. Tente novamente.');
  const cur=await r.json(),db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(u=>u.login===login);
  let mudou=false;
  if(b.action==='request-password-reset'){
    if(u?.ativo&&!u.recuperacaoSolicitadaEm){u.recuperacaoSolicitadaEm=new Date().toISOString();mudou=true;}
  }else{
    const codigo=String(b.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!u?.ativo||u.papel!=='admin'||codigo.length!==16||!confere(codigo,u.recuperacao))return res.status(400).json({ok:false,error:'Usuário ou código de recuperação incorretos.'});
    const senha=String(b.senha||'');
    if(senha.length<8)return res.status(400).json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'});
    const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
    u.senha='pbkdf2$'+iter+'$'+salt+'$'+crypto.pbkdf2Sync(senha,salt,iter,32,'sha256').toString('hex');
    delete u.recuperacaoSolicitadaEm;mudou=true;
  }
  if(mudou){
    db.atualizadoEm=new Date().toISOString();
    const w=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Portal: recuperação de acesso',branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
    if(!w.ok)throw new Error('Não foi possível salvar a recuperação. Tente novamente.');
  }
  return res.status(200).json({ok:true,message:b.action==='request-password-reset'?'Se o usuário estiver ativo, a solicitação estará disponível para a franqueadora redefinir a senha.':'Senha redefinida. Entre com a nova senha.'});
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
    const b=body(req);
    if(['request-password-reset','recover-password'].includes(b.action))return await recuperar(b,res);
    const login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
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
+crypto.pbkdf2Sync(senhaNova,salt,iter,32,'sha256').toString('hex');
  delete u.recuperacaoSolicitadaEm;
  db.atualizadoEm=new Date().toISOString();
  const w=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Portal: '+u.login+' trocou a própria senha',branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
  if(!w.ok)throw new Error('Não foi possível salvar a nova senha. Tente novamente.');
  return res.status(200).json({ok:true,message:'Senha alterada com sucesso.'});
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
async function recuperar(b,res){
  const login=String(b.login||'').trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,40}$/.test(login))return res.status(400).json({ok:false,error:'Informe seu usuário do Portal.'});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error('Recuperação indisponível. Procure a franqueadora.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'avec-portal-api'};
  const url='https://api.github.com/repos/'+REPO+'/contents/'+FILE;
  const r=await fetch(url+'?ref='+encodeURIComponent(BRANCH),{headers,cache:'no-store'});
  if(!r.ok)throw new Error('Não foi possível consultar os acessos. Tente novamente.');
  const cur=await r.json(),db=JSON.parse(Buffer.from(cur.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(u=>u.login===login);
  let mudou=false;
  if(b.action==='request-password-reset'){
    if(u?.ativo&&!u.recuperacaoSolicitadaEm){u.recuperacaoSolicitadaEm=new Date().toISOString();mudou=true;}
  }else{
    const codigo=String(b.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!u?.ativo||u.papel!=='admin'||codigo.length!==16||!confere(codigo,u.recuperacao))return res.status(400).json({ok:false,error:'Usuário ou código de recuperação incorretos.'});
    const senha=String(b.senha||'');
    if(senha.length<8)return res.status(400).json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'});
    const salt=crypto.randomBytes(16).toString('hex'),iter=210000;
    u.senha='pbkdf2$'+iter+'$'+salt+'$'+crypto.pbkdf2Sync(senha,salt,iter,32,'sha256').toString('hex');
    delete u.recuperacaoSolicitadaEm;mudou=true;
  }
  if(mudou){
    db.atualizadoEm=new Date().toISOString();
    const w=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Portal: recuperação de acesso',branch:BRANCH,sha:cur.sha,content:Buffer.from(JSON.stringify(db,null,2)).toString('base64')})});
    if(!w.ok)throw new Error('Não foi possível salvar a recuperação. Tente novamente.');
  }
  return res.status(200).json({ok:true,message:b.action==='request-password-reset'?'Se o usuário estiver ativo, a solicitação estará disponível para a franqueadora redefinir a senha.':'Senha redefinida. Entre com a nova senha.'});
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
    const b=body(req);
    if(['request-password-reset','recover-password'].includes(b.action))return await recuperar(b,res);
    const login=String(b.login||'').trim().toLowerCase(),senha=String(b.senha||'');
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
