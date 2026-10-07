import {cors,dispatch,body,fail} from '../lib/github.js';

const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
const CACHE_MS=30*60*1000;

async function buscaRecente({nicho,cidade,bairro,allowOld=false}){
  try{
    const token=process.env.GITHUB_TOKEN;
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const branch=process.env.GITHUB_BRANCH||'main';
    const r=await fetch('https://api.github.com/repos/'+repo+'/contents/extrator-data/latest.json?ref='+encodeURIComponent(branch),{
      headers:{
        Authorization:'Bearer '+token,
        Accept:'application/vnd.github.raw+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'avec-portal-api'
      },
      cache:'no-store'
    });
    if(!r.ok)return null;
    const data=await r.json();
    const run=(data.runs||[]).find(x=>
      norm(x.query?.nicho)===norm(nicho) &&
      norm(x.query?.cidade)===norm(cidade) &&
      norm(x.query?.bairro||'')===norm(bairro||'')
    );
    if(!run)return null;
    if(allowOld)return run;
    const fim=new Date(run.finished_at||0).getTime();
    if(!fim||Date.now()-fim>CACHE_MS)return null;
    return run;
  }catch{return null}
}

export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  try{
    if(req.method==='GET'){
      const q=req.query||{};
      const nicho=String(q.nicho||'').trim(),cidade=String(q.cidade||'').trim(),bairro=String(q.bairro||'').trim();
      const since=Number(q.since||0);
      if(!nicho||!cidade)return res.status(400).json({ok:false,error:'Nicho e cidade sao obrigatorios'});
      let run=await buscaRecente({nicho,cidade,bairro,allowOld:true});
      if(run&&since&&new Date(run.finished_at||0).getTime()<since)run=null;
      return res.status(200).json({ok:true,ready:!!run,run});
    }
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
    const b=body(req),nicho=String(b.nicho||'').trim(),cidade=String(b.cidade||'').trim(),bairro=String(b.bairro||'').trim();
    if(!nicho||!cidade) return res.status(400).json({ok:false,error:'Nicho e cidade sao obrigatorios'});
    const recente=await buscaRecente({nicho,cidade,bairro});
    if(recente) return res.status(200).json({ok:true,cached:true,run:recente});
    const max=Math.max(1,Math.min(Number(b.max_results)||80,120));
    await dispatch('update-leads.yml',{nicho,cidade,bairro,max_results:String(max)});
    return res.status(202).json({ok:true,cached:false});
  }catch(e){return fail(res,e)}
}
