import crypto from 'node:crypto';
import {requireCurrentUser} from '../lib/current-user.js';

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
  res.setHeader('Cache-Control','no-store');
}
function auth(req){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret)throw Object.assign(new Error('Chave de sessao indisponivel'),{status:500});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [p,s]=token.split('.');
  if(!p||!s)throw Object.assign(new Error('Entre novamente'),{status:401});
  const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  const a=Buffer.from(s),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error('Sessao invalida'),{status:401});
  const d=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
  if(Date.now()>Number(d.exp||0))throw Object.assign(new Error('Sessao expirada'),{status:401});
  return d;
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const u=await requireCurrentUser(auth(req));
    return res.status(200).json({
      ok:true,
      role:u.papel==='admin'?'admin':'franqueado',
      email:u.login,
      name:u.nome||u.login,
      franchise_ids:u.papel==='admin'?null:(u.franquiaId?[u.franquiaId]:[])
    });
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Falha ao validar acesso'});
  }
}
