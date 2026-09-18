const REPO = process.env.GITHUB_REPOSITORY || 'avec-franquias/Dashboard-comercial-avec';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

export function cors(req,res){
  const origin=req.headers.origin||'*';
  const allowed=(process.env.PORTAL_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const ok=!allowed.length||allowed.includes(origin);
  res.setHeader('Access-Control-Allow-Origin',ok?origin:(allowed[0]||'*'));
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
  return ok;
}
export async function dispatch(workflow,inputs){
  const token=process.env.GITHUB_TOKEN;
  if(!token) throw new Error('GITHUB_TOKEN nao configurado no servidor');
  const r=await fetch('https://api.github.com/repos/'+REPO+'/actions/workflows/'+workflow+'/dispatches',{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+token,
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'Content-Type':'application/json',
      'User-Agent':'avec-portal-api'
    },
    body:JSON.stringify({ref:BRANCH,inputs})
  });
  if(!r.ok){
    const txt=await r.text();
    throw new Error('GitHub '+r.status+': '+txt.slice(0,300));
  }
}
export function body(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}')}catch{return {}}
}
export function fail(res,err,status=500){
  res.status(status).json({ok:false,error:err?.message||String(err)});
}