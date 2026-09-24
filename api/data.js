import {fail} from '../lib/github.js';

async function fetchText(url, headers={}){
  const r=await fetch(url,{headers,cache:'no-store'});
  if(!r.ok) throw new Error('Base indisponivel ('+r.status+')');
  return r.text();
}

export default async function handler(req,res){
  try{
    const type=String(req.query?.type||'').trim().toLowerCase();
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const branch=process.env.GITHUB_BRANCH||'main';
    const token=process.env.GITHUB_TOKEN;
    let txt;

    if(type==='leads'){
      txt=await fetchText(
        'https://raw.githubusercontent.com/'+repo+'/'+branch+'/extrator-data/latest.json',
        {'User-Agent':'avec-portal-api'}
      );
    }else if(type==='instagram'){
      txt=await fetchText(
        'https://api.github.com/repos/'+repo+'/contents/instagram-data/latest.json?ref='+encodeURIComponent(branch),
        {Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'}
      );
    }else if(type==='clientes'){
      txt=await fetchText(
        'https://api.github.com/repos/'+repo+'/contents/clientes-enrichment/latest.json?ref='+encodeURIComponent(branch),
        {Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'}
      );
    }else{
      return res.status(400).json({ok:false,error:'Tipo de base invalido'});
    }

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(txt);
  }catch(e){return fail(res,e)}
}
