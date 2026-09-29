const APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwQK_75NiVyMR0VPK1GByPx6N3Buq-wVHrJUZJFTGeMwiVM8gWyATUPILsXAOizXRZ8uQ/exec';

function cors(req,res){
  const o=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',o);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const payload=req.body?.payload;
    if(!payload||typeof payload!=='object') return res.status(400).json({ok:false,error:'Payload invalido'});
    const url=APPS_SCRIPT_URL+'?payload='+encodeURIComponent(JSON.stringify(payload))+'&_='+Date.now();
    const r=await fetch(url,{method:'GET',redirect:'follow',headers:{'User-Agent':'avec-portal/1.0','Accept':'application/json,text/plain,*/*'}});
    const txt=await r.text();
    const ct=String(r.headers.get('content-type')||'');
    if(/<html/i.test(txt)||/text\/html/i.test(ct)){
      const clean=txt.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
      return res.status(502).json({ok:false,error:'O servico de token do Google nao esta publicado para acesso externo.',detalhe:clean||'Resposta HTML do Google'});
    }
    let data;
    try{data=JSON.parse(txt)}catch{data=txt}
    if(!r.ok) return res.status(r.status).json({ok:false,error:(data&&data.error)||('Google respondeu '+r.status),detalhe:typeof data==='string'?data.slice(0,300):data});
    return res.status(200).json({ok:true,data});
  }catch(e){
    return res.status(500).json({ok:false,error:'Falha ao gerar token',detalhe:e.message});
  }
}
