import crypto from 'node:crypto';
import {cors,dispatch,fail} from '../lib/github.js';

function session(req){
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const [payload,sig]=raw.split('.');
  if(!payload||!sig)throw Object.assign(new Error('Sessao invalida.'),{status:401});
  const secret=process.env.PORTAL_SESSION_SECRET||process.env.GITHUB_TOKEN;
  if(!secret)throw Object.assign(new Error('Chave de sessao indisponivel.'),{status:500});
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error('Sessao invalida.'),{status:401});
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data?.login||!data.exp||Date.now()>Number(data.exp))throw Object.assign(new Error('Sessao expirada.'),{status:401});
  if(String(data.papel||data.perfil||'').toLowerCase()!=='admin')throw Object.assign(new Error('Apenas administrador pode iniciar a atualizacao nacional.'),{status:403});
  return data;
}

export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const u=session(req);
    await dispatch('update-regions-queue.yml',{lote:'3',nicho:'Salão de beleza'});
    return res.status(202).json({ok:true,status:'fila_iniciada',solicitado_por:u.login,lote:3});
  }catch(e){return fail(res,e,e?.status||500)}
}
