import crypto from 'node:crypto';

const REPO=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const FILE='usuarios.json';

function cors(req,res){
  const origin=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Cache-Control','no-store');
}
function body(req){if(req.body&&typeof req.body==='object')return req.body;try{return JSON.parse(req.body||'{}')}catch{return {}}}
function validar(req){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret) throw Object.assign(new Error('Chave administrativa indisponivel'),{status:500});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [p,s]=token.split('.');
  if(!p||!s) throw Object.assign(new Error('Sessao administrativa invalida. Entre novamente.'),{status:401});
  const exp=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  const a=Buffer.from(s),b=Buffer.from(exp);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw Object.assign(new Error('Sessao administrativa invalida. Entre novamente.'),{status:401});
  const data=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
  if(data.papel!=='admin'||Date.now()>Number(data.exp||0)) throw Object.assign(new Error('Sessao administrativa expirada. Entre novamente.'),{status:401});
  return data;
}
async function gh(path,opts={}){
  const token=process.env.GITHUB_TOKEN;
  if(!token) throw Object.assign(new Error('GITHUB_TOKEN nao configurado na Vercel'),{status:500});
  const r=await fetch('https://api.github.com/repos/'+REPO+path,{...opts,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'avec-portal-api',...(opts.headers||{})}});
  const txt=await r.text(); let j={};try{j=txt?JSON.parse(txt):{}}catch{}
  if(!r.ok) throw Object.assign(new Error(j.message||('Falha ao salvar ('+r.status+')')),{status:r.status});
  return j;
}
export default async function handler(req,res){
  cors(req,res); if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const admin=validar(req), b=body(req);
    if(!Array.isArray(b.usuarios)||!b.manutencao||typeof b.manutencao!=='object') return res.status(400).json({ok:false,error:'Dados administrativos invalidos'});
    const cur=await gh('/contents/'+FILE+'?ref='+encodeURIComponent(BRANCH));
    const doc={instalacao:b.instalacao||'portal-franqueado',atualizadoEm:new Date().toISOString(),usuarios:b.usuarios,manutencao:b.manutencao};
    await gh('/contents/'+FILE,{method:'PUT',body:JSON.stringify({message:b.mensagem||('Portal: atualizacao administrativa por '+admin.login),content:Buffer.from(JSON.stringify(doc,null,1),'utf8').toString('base64'),branch:BRANCH,sha:cur.sha})});
    return res.status(200).json({ok:true,usuarios:doc.usuarios,manutencao:doc.manutencao});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message||'Falha administrativa'})}
}
