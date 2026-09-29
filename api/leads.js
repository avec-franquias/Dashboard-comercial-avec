import {cors,dispatch,body,fail} from '../lib/github.js';

const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
const CACHE_MS=30*60*1000;

async function buscaRecente({nicho,cidade,bairro}){
  try{
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const branch=process.env.GITHUB_BRANCH||'main';
    const r=await fetch('https://raw.githubusercontent.com/'+repo+'/'+branch+'/extrator-data/latest.json?ts='+Date.now(),{
      headers:{'User-Agent':'avec-portal-api'},
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
    const fim=new Date(run.finished_at||0).getTime();
    if(!fim||Date.now()-fim>CACHE_MS)return null;
    return run;
  }catch{return null}
}

export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  try{
    const b=body(req),nicho=String(b.nicho||'').trim(),cidade=String(b.cidade||'').trim(),bairro=String(b.bairro||'').trim();
    if(!nicho||!cidade) return res.status(400).json({ok:false,error:'Nicho e cidade sao obrigatorios'});
    const recente=await buscaRecente({nicho,cidade,bairro});
    if(recente) return res.status(200).json({ok:true,cached:true,run:recente});
    const max=Math.max(1,Math.min(Number(b.max_results)||80,120));
    await dispatch('update-leads.yml',{nicho,cidade,bairro,max_results:String(max)});
    return res.status(202).json({ok:true,cached:false});
  }catch(e){return fail(res,e)}
}
