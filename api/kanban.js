import {requireCurrentUser} from '../lib/current-user.js';
import crypto from 'node:crypto';

const VENDAS_API='https://nvehnztcxwcykhkoygbe.supabase.co/functions/v1/portal-vendas';

function auth(req){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret)throw Object.assign(new Error('Chave de sessao indisponivel'),{status:500});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [p,s]=token.split('.');
  if(!p||!s)throw Object.assign(new Error('Entre novamente no Portal.'),{status:401});
  const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  const a=Buffer.from(s),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error('Sessao invalida.'),{status:401});
  const d=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
  if(Date.now()>Number(d.exp||0))throw Object.assign(new Error('Sessao expirada.'),{status:401});
  return {token,d};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  try{
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
    const {token,d}=auth(req);
    const u=await requireCurrentUser(d);
    if(u.papel!=='admin'&&!(u.effectiveModules||u.modulos||[]).some(k=>['vendas','extrator'].includes(k)))
      throw Object.assign(new Error('Modulo nao liberado.'),{status:403});
    if(u.papel!=='admin'&&!u.franquiaId)
      throw Object.assign(new Error('Franquia nao vinculada.'),{status:403});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(body.action==='validate-access'){
      return res.status(200).json({
        ok:true,
        role:u.papel==='admin'?'admin':'franqueado',
        email:u.login,
        name:u.nome||u.login,
        franchise_ids:u.papel==='admin'?null:(u.franquiaId?[u.franquiaId]:[])
      });
    }
    if(u.papel!=='admin')body.franquiaId=u.franquiaId;
    const r=await fetch(VENDAS_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-AVEC-Portal-Token':token,'X-AVEC-Source':'portal'},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(50000)
    });
    const data=await r.json().catch(()=>({ok:false,error:'Resposta invalida do Kanban.'}));
    return res.status(r.status).json(data);
  }catch(e){
    return res.status(e.status||502).json({ok:false,error:e.message||'Nao foi possivel acessar o Kanban.'});
  }
}
