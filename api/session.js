import crypto from 'node:crypto';

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
  res.setHeader('Cache-Control','no-store');
}
function lerToken(req){
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const [payload,sig]=raw.split('.');
  if(!payload||!sig)throw Object.assign(new Error('Sessao invalida.'),{status:401});
  const secret=process.env.PORTAL_SESSION_SECRET||process.env.GITHUB_TOKEN;
  if(!secret)throw Object.assign(new Error('Chave de sessao indisponivel.'),{status:500});
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  try{
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error();
  }catch{throw Object.assign(new Error('Sessao invalida.'),{status:401});}
  let data=null;
  try{data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))}catch{}
  if(!data?.login||!data.exp||Date.now()>Number(data.exp))throw Object.assign(new Error('Sessao expirada.'),{status:401});
  return data;
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const usuario=lerToken(req);
    return res.status(200).json({ok:true,usuario});
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Falha de sessao'});
  }
}
