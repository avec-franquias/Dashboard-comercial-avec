import {cors,dispatch,body,fail} from '../lib/github.js';

const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
const CACHE_MS=30*60*1000;

async function buscaRecente({nicho,uf,cidade,bairro,palavra,allowOld=false}){
  try{
    const token=process.env.GITHUB_TOKEN;
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const r=await fetch('https://api.github.com/repos/'+repo+'/contents/instagram-data/latest.json?ref=main',{
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
      norm(x.query?.uf)===norm(uf) &&
      norm(x.query?.cidade)===norm(cidade) &&
      norm(x.query?.bairro||'')===norm(bairro||'') &&
      norm(x.query?.palavra_chave||'')===norm(palavra||'')
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
      const nicho=String(q.nicho||'').trim(),uf=String(q.uf||'').trim().toUpperCase(),cidade=String(q.cidade||'').trim(),bairro=String(q.bairro||'').trim(),palavra=String(q.palavra_chave||'').trim();
      const since=Number(q.since||0);
      let run=await buscaRecente({nicho,uf,cidade,bairro,palavra,allowOld:true});
      if(run&&since&&new Date(run.finished_at||0).getTime()<since)run=null;
      return res.status(200).json({ok:true,ready:!!run,run});
    }
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
    const b=body(req);
    const nicho=String(b.nicho||'').trim(),uf=String(b.uf||'').trim().toUpperCase(),cidade=String(b.cidade||'').trim(),bairro=String(b.bairro||'').trim(),palavra=String(b.palavra_chave||'').trim();
    if(!nicho&&!cidade&&!palavra) return res.status(400).json({ok:false,error:'Informe nicho, cidade ou palavra-chave'});
    const recente=await buscaRecente({nicho,uf,cidade,bairro,palavra});
    if(recente) return res.status(200).json({ok:true,cached:true,run:recente});
    const limite=Math.max(1,Math.min(Number(b.limite)||100,200));
    await dispatch('update-instagram.yml',{nicho,uf,cidade,bairro,palavra_chave:palavra,limite:String(limite)});
    return res.status(202).json({ok:true,cached:false});
  }catch(e){return fail(res,e)}
}
