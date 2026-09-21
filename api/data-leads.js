import {fail} from './_github.js';
export default async function handler(req,res){
  try{
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const branch=process.env.GITHUB_BRANCH||'main';
    const r=await fetch('https://raw.githubusercontent.com/'+repo+'/'+branch+'/extrator-data/latest.json',{
      headers:{'User-Agent':'avec-portal-api'},cache:'no-store'
    });
    if(!r.ok) throw new Error('Base de leads indisponivel ('+r.status+')');
    const txt=await r.text();
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(txt);
  }catch(e){return fail(res,e)}
}
