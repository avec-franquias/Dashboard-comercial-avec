import {fail} from './_github.js';
export default async function handler(req,res){
  try{
    const token=process.env.GITHUB_TOKEN;
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const r=await fetch('https://api.github.com/repos/'+repo+'/contents/extrator-data/latest.json?ref=main',{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'},
      cache:'no-store'
    });
    if(!r.ok) throw new Error('Base de leads indisponivel ('+r.status+')');
    const txt=await r.text();
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(txt);
  }catch(e){return fail(res,e)}
}
